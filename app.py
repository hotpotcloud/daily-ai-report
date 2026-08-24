#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
daily-ai-briefing 后端 · Python Flask(零缓存、零 Node、零 SQLite)。
部署在 milen 服务器 3535 端口。

依赖:Python 3.8+,Flask(系统已装),全部 stdlib except Flask。
"""
import os
import json
import re
import html
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

from flask import Flask, request, jsonify, Response, send_from_directory, stream_with_context

APP_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(APP_DIR, "public")

DEFAULT_BASE_URL = "https://api.minimaxi.com/v1"
DEFAULT_MODEL = "MiniMax-M3"

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# 7 个稳定源(已从服务器实测)
#   类别:ai / tech / market
#   lang:zh / en(影响中文过滤)
#   type:rss / json_wscn / json_sina
NEWS_SOURCES = [
    {
        "name": "36氪 · 资讯", "url": "https://www.36kr.com/feed",
        "cat": "tech", "lang": "zh", "type": "rss", "limit": 12,
    },
    {
        "name": "36氪 · 快讯", "url": "https://www.36kr.com/feed-newsflash",
        "cat": "tech", "lang": "zh", "type": "rss", "limit": 10,
    },
    {
        "name": "雷锋网", "url": "https://www.leiphone.com/feed",
        "cat": "ai", "lang": "zh", "type": "rss", "limit": 12,
    },
    {
        "name": "IT之家", "url": "https://www.ithome.com/rss/",
        "cat": "tech", "lang": "zh", "type": "rss", "limit": 12,
    },
    {
        "name": "Solidot", "url": "https://www.solidot.org/index.rss",
        "cat": "tech", "lang": "zh", "type": "rss", "limit": 8,
    },
    {
        "name": "华尔街见闻 · 全球", "url": "https://api-one.wallstcn.com/apiv1/content/articles?channel=global&limit=20",
        "cat": "market", "lang": "zh", "type": "json_wscn", "limit": 12,
    },
    {
        "name": "华尔街见闻 · A股", "url": "https://api-one.wallstcn.com/apiv1/content/articles?channel=a-stock&limit=20",
        "cat": "market", "lang": "zh", "type": "json_wscn", "limit": 12,
    },
    {
        "name": "新浪财经", "url": "https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516&num=20&versionNumber=1.2.4&page=1",
        "cat": "market", "lang": "zh", "type": "json_sina", "limit": 12,
    },
    {
        "name": "CNBC · Finance", "url": "https://www.cnbc.com/id/10001147/device/rss/rss.html",
        "cat": "market", "lang": "en", "type": "rss", "limit": 10,
    },
]

# 基于关键词对单条新闻做类别再校准(同源可能跨类)
CATEGORY_KEYWORDS = {
    "ai": [
        "AI", "人工智能", "模型", "大模型", "LLM", "GPT", "Claude", "Gemini",
        "OpenAI", "Anthropic", "Mistral", "训练", "推理", "Transformer",
        "深度学习", "神经网络", "ChatGPT", "Sora", "智能体", "Agent",
    ],
    "tech": [
        "芯片", "半导体", "处理器", "GPU", "CPU", "台积电", "TSMC", "Intel",
        "Nvidia", "英伟达", "AMD", "高通", "Apple", "苹果", "Google", "谷歌",
        "Microsoft", "微软", "Meta", "亚马逊", "AWS", "Azure",
        "开源", "GitHub", "开发者", "API", "云计算", "数据中心",
    ],
    "market": [
        "A股", "港股", "美股", "纳斯达克", "标普", "道琼斯", "恒生", "上证",
        "深证", "创业板", "中概", "中概股", "人民币", "美元", "汇率",
        "央行", "美联储", "Fed", "降息", "加息", "利率", "国债", "收益率",
        "GDP", "CPI", "PPI", "通胀", "通缩", "油价", "黄金", "比特币", "BTC",
        "财报", "业绩", "IPO", "并购", "回购", "分红", "市值", "股价",
        "涨停", "跌停", "上涨", "下跌", "牛市", "熊市",
    ],
}


def infer_category(title, default):
    """基于标题关键词重判类别,默认走源类别。"""
    if not title:
        return default
    text = title
    # 优先匹配更长的关键词(避免误判),按类别出现次数取最多
    scores = {default: 1}  # 默认给源类别 +1,让"无关源"也能保住默认
    for cat, keywords in CATEGORY_KEYWORDS.items():
        s = 0
        for kw in keywords:
            if kw in text:
                s += 1
        if s:
            scores[cat] = scores.get(cat, 0) + s
    return max(scores.items(), key=lambda x: x[1])[0]


def is_chinese_text(text):
    """判断是否主要为中文(中文字符占 30% 以上)。"""
    if not text:
        return False
    chinese = sum(1 for c in text if "\u4e00" <= c <= "\u9fff")
    return chinese > 0 and chinese >= len(text) * 0.3


# 占位/无意义标题 — 过滤掉
PLACEHOLDER_PATTERNS = [
    "更多消息", "持续更新", "更多新闻", "查看更多", "加载更多",
    "点击查看", "暂无数据", "稍后", "more news", "click here",
    "read more", "查看全文", "all news",
]


def is_placeholder_title(title):
    if not title:
        return True
    t = title.strip()
    if len(t) < 6:  # 太短
        return True
    low = t.lower()
    for p in PLACEHOLDER_PATTERNS:
        if p in low:
            return True
    return False


def is_placeholder_item(item):
    """整条新闻是否占位/无意义(标题或描述命中)。"""
    if is_placeholder_title(item.get("title", "")):
        return True
    desc = (item.get("description") or "").lower()
    for p in ("更多消息", "持续更新", "查看更多", "加载更多", "暂无数据", "more news", "click here", "read more"):
        if p in desc:
            return True
    return False

# ---------- 配置读取(只走环境变量,零缓存) ----------

def get_api_key():
    return os.environ.get("MINIMAX_API_KEY", "").strip()

def get_base_url():
    return os.environ.get("MINIMAX_BASE_URL", DEFAULT_BASE_URL).rstrip("/")

def get_model():
    return os.environ.get("MINIMAX_MODEL", DEFAULT_MODEL)

# ---------- 抓取(每次请求实时拉,零缓存) ----------

def fetch_url(url, timeout=12, source_type="rss"):
    accept = "*/*"
    if source_type == "rss":
        accept = "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"
    elif source_type.startswith("json_"):
        accept = "application/json, */*"
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": accept,
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        # RSS 类源有时声明 text/html 但内容是 xml,统一按 utf-8 解
        return raw.decode("utf-8", errors="replace")


def strip_html(text):
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", html.unescape(text)).strip()


def parse_rss(xml_text):
    items = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return items
    for item in root.iter("item"):
        t = item.find("title")
        l = item.find("link")
        p = item.find("pubDate")
        d = item.find("description")
        title = strip_html(t.text if t is not None and t.text else "")
        link = (l.text or "").strip() if l is not None and l.text else ""
        pub = p.text if p is not None and p.text else None
        desc_raw = d.text if d is not None and d.text else ""
        desc = strip_html(desc_raw)[:400]
        # 图片:enclosure > media:* > description 里的 <img>
        image = _extract_rss_image(item, desc_raw)
        if title and link:
            items.append({
                "title": title,
                "link": link,
                "publishedAt": pub,
                "description": desc,
                "image": image,
            })
    return items


def _extract_rss_image(item, desc_raw):
    # 1) <enclosure type="image/...">
    for enc in item.iter("enclosure"):
        if (enc.get("type") or "").startswith("image/"):
            url = enc.get("url")
            if url:
                return url.strip()
    # 2) <media:thumbnail> / <media:content>
    for child in item.iter():
        local = child.tag.split("}")[-1] if "}" in child.tag else child.tag
        if local in ("thumbnail", "content") and "media" in (child.tag):
            url = child.get("url")
            if url:
                return url.strip()
    # 3) 第一张 <img> 在 description 里
    if desc_raw:
        m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', desc_raw, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None


def parse_json_wscn(text):
    """华尔街见闻 → data.items[]"""
    try:
        obj = json.loads(text)
    except (ValueError, TypeError):
        return []
    items = obj.get("data", {}).get("items", []) or []
    out = []
    for it in items:
        title = (it.get("title") or "").strip()
        if not title:
            continue
        ts = it.get("display_time")
        pub_iso = None
        if ts:
            try:
                pub_iso = datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
            except (ValueError, TypeError, OSError):
                pass
        # 图片:image.uri
        image = None
        img = it.get("image")
        if isinstance(img, dict):
            image = (img.get("uri") or "").strip() or None
        out.append({
            "title": title,
            "link": it.get("uri") or "",
            "publishedAt": pub_iso,
            "description": (it.get("content_short") or "")[:400],
            "image": image,
        })
    return out


def parse_json_sina(text):
    """新浪财经 → result.data[]"""
    try:
        obj = json.loads(text)
    except (ValueError, TypeError):
        return []
    items = obj.get("result", {}).get("data", []) or []
    out = []
    for it in items:
        title = (it.get("title") or "").strip()
        if not title:
            continue
        ts = it.get("ctime")
        pub_iso = None
        if ts:
            try:
                pub_iso = datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
            except (ValueError, TypeError, OSError):
                pass
        # 优先 url 字段,可能 list 形式取第一个
        url = it.get("url") or ""
        if not url and isinstance(it.get("urls"), list) and it["urls"]:
            url = it["urls"][0]
        # 图片:img.u > images[0].u
        image = None
        img = it.get("img")
        if isinstance(img, dict) and img.get("u"):
            image = img["u"]
        elif isinstance(it.get("images"), list) and it["images"]:
            first = it["images"][0]
            if isinstance(first, dict) and first.get("u"):
                image = first["u"]
        out.append({
            "title": title,
            "link": url,
            "publishedAt": pub_iso,
            "description": (it.get("intro") or "")[:400],
            "media": it.get("media_name", ""),
            "image": image,
        })
    return out


def fetch_source(source):
    """抓单个源,失败/无 item 都返回 None。"""
    try:
        text = fetch_url(source["url"], source_type=source["type"])
    except Exception as e:
        return {"_error": f"{type(e).__name__}: {str(e)[:60]}"}

    st = source["type"]
    if st == "rss":
        items = parse_rss(text)
    elif st == "json_wscn":
        items = parse_json_wscn(text)
    elif st == "json_sina":
        items = parse_json_sina(text)
    else:
        return {"_error": f"unknown type {st}"}

    if not items:
        return {"_error": "no items parsed"}

    lim = source.get("limit", 10)
    out = []
    for it in items[:lim]:
        cat = infer_category(it.get("title", ""), source["cat"])
        out.append({
            "source": source["name"],
            "category": cat,
            **it,
        })
    return out


def fetch_all_news():
    """并发抓全部源,聚合 + 中文过滤(英文源不过滤)+ 去重 + 排序。"""
    raw_items = []
    sources_summary = []
    failed = []
    # 并发抓取,避免单源慢导致整体超时
    with ThreadPoolExecutor(max_workers=len(NEWS_SOURCES)) as ex:
        futures = {ex.submit(fetch_source, src): src for src in NEWS_SOURCES}
        for fut in as_completed(futures):
            src = futures[fut]
            try:
                r = fut.result(timeout=20)
            except Exception as e:
                r = None
            if r is None:
                failed.append({"source": src["name"], "error": "timeout"})
                sources_summary.append({"name": src["name"], "count": 0, "ok": False})
                continue
            if isinstance(r, dict) and "_error" in r:
                failed.append({"source": src["name"], "error": r["_error"]})
                sources_summary.append({"name": src["name"], "count": 0, "ok": False})
                continue
            sources_summary.append({"name": src["name"], "count": len(r), "ok": True})
            raw_items.extend(r)

    # 中文过滤(只对 zh 源过滤;en 源保留)
    # 简化:基于单条 source 的 lang 决定是否过滤
    source_lang = {s["name"]: s.get("lang", "zh") for s in NEWS_SOURCES}
    before = len(raw_items)
    filtered = []
    filtered_out = 0
    placeholder_out = 0
    for it in raw_items:
        if is_placeholder_item(it):
            placeholder_out += 1
            continue
        if source_lang.get(it["source"], "zh") == "zh":
            if is_chinese_text(it.get("title", "")):
                filtered.append(it)
            else:
                filtered_out += 1
        else:
            # 英文源:如果标题里夹中文也保留(投资新闻常出现 ticker)
            filtered.append(it)

    # 去重:同标题只保留一条(同源不同频道可能返同一新闻,跨源转发的也只留一条)
    seen = set()
    deduped = []
    for it in filtered:
        key = (it.get("title", "") or "").strip()[:50]
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(it)

    def sort_key(item):
        ts = item.get("publishedAt", "")
        if not ts:
            return 0
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
        except Exception:
            return 0

    deduped.sort(key=sort_key, reverse=True)

    return {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "totals": {"all": len(deduped), "raw": len(raw_items)},
        "sources": sources_summary,
        "failedSources": failed,
        "filteredNonChinese": filtered_out,
        "filteredPlaceholder": placeholder_out,
        "items": deduped[:30],
    }

# ---------- M3 chat 调用 ----------

def build_chat_messages(user_messages):
    """注入实时新闻到 system prompt。"""
    news = fetch_all_news()
    lines = []
    for it in news.get("items", [])[:12]:
        lines.append(f"- [{it.get('source', '')}] {it.get('title', '')}")
    news_text = "\n".join(lines)
    system = (
        "你是 daily-ai-briefing 项目的 AI 助手,基于下方提供的实时新闻回答用户问题。\n"
        "严格基于新闻内容回答,不要编造未出现的事实。\n"
        "如果用户问到的内容新闻里没覆盖,诚实说明。\n"
        "回答用中文,简洁直接,先给结论再给依据。\n\n"
        f"=== 实时新闻({news.get('fetchedAt', '')})===\n{news_text}\n"
    )
    msgs = [{"role": "system", "content": system}]
    msgs.extend(user_messages)
    return msgs

def m3_chat_stream(messages):
    body = json.dumps({
        "model": get_model(),
        "messages": messages,
        "stream": True,
        "temperature": 0.5,
        "max_completion_tokens": 2000
    }, ensure_ascii=False).encode("utf-8")
    url = get_base_url() + "/chat/completions"
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": "Bearer " + get_api_key(),
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
    }, method="POST")
    with urllib.request.urlopen(req, timeout=90) as resp:
        for raw in resp:
            line = raw.decode("utf-8", errors="replace").strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                obj = json.loads(data)
                delta = obj.get("choices", [{}])[0].get("delta", {}).get("content")
                if delta:
                    yield delta
            except (json.JSONDecodeError, KeyError, IndexError):
                pass

def m3_chat_blocking(messages):
    body = json.dumps({
        "model": get_model(),
        "messages": messages,
        "temperature": 0.5,
        "max_completion_tokens": 2000
    }, ensure_ascii=False).encode("utf-8")
    url = get_base_url() + "/chat/completions"
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": "Bearer " + get_api_key(),
        "Content-Type": "application/json"
    }, method="POST")
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="replace"))
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")

# ---------- Flask app ----------

app = Flask(__name__, static_folder=None)

@app.route("/")
def index():
    return send_from_directory(PUBLIC_DIR, "feed.html")

@app.route("/chat")
def chat_page():
    return send_from_directory(PUBLIC_DIR, "chat.html")

@app.route("/<path:filename>")
def static_file(filename):
    # 防路径穿越
    if ".." in filename or filename.startswith("/"):
        return jsonify({"error": "forbidden"}), 403
    return send_from_directory(PUBLIC_DIR, filename)

@app.route("/api/health")
def health():
    return jsonify({
        "ok": True,
        "service": "daily-ai-briefing",
        "model": get_model(),
        "has_api_key": bool(get_api_key()),
        "cache": False
    })

DIGEST_PATH = os.path.join(APP_DIR, "data", "digest.json")

@app.route("/api/digest/latest")
def digest_latest():
    """读最近一次 M3 聚合的日报(由 daily-briefing workflow 每天 8 点推过来)。"""
    if not os.path.exists(DIGEST_PATH):
        return jsonify({
            "ok": False,
            "message": "今日 AI 整理日报还没生成,等每天 8:00 的定时任务跑"
        }), 404
    try:
        with open(DIGEST_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        # 加上 mtime 方便前端显示
        mtime = os.path.getmtime(DIGEST_PATH)
        data["_generatedAt"] = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        return jsonify(data)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/api/news")
def news():
    try:
        return jsonify(fetch_all_news())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/chat", methods=["POST"])
def chat():
    if not get_api_key():
        return jsonify({"error": "MINIMAX_API_KEY 未配置"}), 500

    payload = request.get_json(silent=True) or {}
    user_messages = []
    if isinstance(payload.get("messages"), list) and payload["messages"]:
        user_messages = [
            {"role": m.get("role", "user"), "content": m.get("content", "")}
            for m in payload["messages"]
            if m.get("content")
        ]
    elif isinstance(payload.get("message"), str) and payload["message"].strip():
        user_messages = [{"role": "user", "content": payload["message"].strip()}]
    else:
        return jsonify({"error": "需要 message 或 messages"}), 400

    if not user_messages:
        return jsonify({"error": "消息不能为空"}), 400

    messages = build_chat_messages(user_messages)
    want_stream = (
        request.args.get("stream") == "true"
        or "text/event-stream" in (request.headers.get("Accept") or "")
    )

    if want_stream:
        def generate():
            try:
                for delta in m3_chat_stream(messages):
                    yield "data: " + json.dumps({"delta": delta}, ensure_ascii=False) + "\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                yield "data: " + json.dumps({"error": str(e)}, ensure_ascii=False) + "\n\n"
        return Response(stream_with_context(generate()), mimetype="text/event-stream")
    else:
        try:
            content = m3_chat_blocking(messages)
            return jsonify({"content": content, "model": get_model()})
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            return jsonify({"error": "M3 API HTTP {}: {}".format(e.code, body[:300])}), 500
        except Exception as e:
            return jsonify({"error": str(e)}), 500

# ---------- 启动 ----------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3535))
    host = os.environ.get("HOST", "0.0.0.0")
    print("[daily-ai-briefing] starting on {}:{}".format(host, port))
    print("[daily-ai-briefing] api_key set: {}, model: {}".format(bool(get_api_key()), get_model()))
    print("[daily-ai-briefing] cache: DISABLED(每次实时拉)")
    app.run(host=host, port=port, threaded=True, debug=False)
