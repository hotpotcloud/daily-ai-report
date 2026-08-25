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
import secrets
import urllib.request
import urllib.error
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

from flask import Flask, request, jsonify, Response, send_from_directory, stream_with_context, session, redirect

APP_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(APP_DIR, "public")
DIST_DIR = os.path.join(APP_DIR, "web", "dist")

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
        "items": deduped[:20],
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
# Session 用于 OAuth 流程;secret 优先读 env,否则随机生成(进程重启会失效)
app.secret_key = os.environ.get("FLASK_SECRET") or secrets.token_hex(32)
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["PERMANENT_SESSION_LIFETIME"] = 60 * 60 * 24 * 30  # 30 天

# OAuth 日志:用 systemd 日志(/var/log/daily-ai-briefing.log)记录每次 token 交换
import logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    stream=__import__("sys").stderr
)

# OAuth 配置:统一用裸名(CLIENT_ID / CLIENT_SECRET / GOOGLE_*)
GITHUB_CLIENT_ID = os.environ.get("CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("CLIENT_SECRET", "")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://119.29.189.103:3535")

# ---------- OAuth HTTP helper(带 retry + 长 timeout + 详细日志)----------

def _oauth_http_json(method, url, *, data=None, headers=None, timeout=30, label=""):
    """带 2 次重试的 JSON HTTP 请求。详细错误信息方便诊断 timeout / 网络问题。"""
    import logging
    log = logging.getLogger("oauth")
    if data is not None and isinstance(data, (dict, list)):
        body = json.dumps(data).encode("utf-8")
    elif isinstance(data, (bytes, str)):
        body = data.encode("utf-8") if isinstance(data, str) else data
    else:
        body = None
    h = {"Accept": "application/json"}
    if body is not None:
        h["Content-Type"] = "application/json"
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    last_err = None
    for attempt in range(1, 3):
        try:
            log.info("[oauth:%s] attempt %d %s %s (timeout=%ds)", label, attempt, method, url, timeout)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                return json.loads(raw.decode("utf-8", errors="replace"))
        except urllib.error.HTTPError as e:
            body = ""
            try: body = e.read().decode("utf-8", errors="replace")
            except Exception: pass
            last_err = f"HTTP {e.code}: {body[:200] or e.reason}"
            log.error("[oauth:%s] HTTPError attempt %d: %s", label, attempt, last_err)
            # 4xx 不重试(配置错误/参数错)
            if 400 <= e.code < 500:
                break
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            log.error("[oauth:%s] attempt %d failed: %s", label, attempt, last_err)
    raise RuntimeError(last_err or "OAuth HTTP failed")

# ---------- 鉴权路由 ----------

@app.route("/api/auth/providers")
def auth_providers():
    """前端按钮用:返回已配置的 provider 列表(没配 Client ID 的不显示)"""
    out = []
    if GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET:
        out.append({"id": "github", "label": "GitHub"})
    if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
        out.append({"id": "google", "label": "Google"})
    return jsonify({"providers": out, "configured": bool(out)})

@app.route("/api/auth/me")
def auth_me():
    u = session.get("user")
    return jsonify({"user": u, "providers": _configured_providers()})

def _configured_providers():
    out = []
    if GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET:
        out.append("github")
    if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
        out.append("google")
    return out

@app.route("/api/auth/logout")
def auth_logout():
    session.pop("user", None)
    session.pop("oauth_state", None)
    return redirect("/")

# ---------- GitHub OAuth ----------

@app.route("/api/auth/github")
def auth_github():
    if not (GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET):
        return jsonify({"error": "GitHub OAuth 未配置,请联系管理员设置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET"}), 503
    state = secrets.token_urlsafe(24)
    session["oauth_state"] = state
    session["oauth_provider"] = "github"
    params = {
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": APP_BASE_URL + "/api/auth/github/callback",
        "scope": "read:user user:email",
        "state": state,
        "allow_signup": "true"
    }
    return redirect("https://github.com/login/oauth/authorize?" + urllib.parse.urlencode(params))

@app.route("/api/auth/github/callback")
def auth_github_callback():
    code = request.args.get("code")
    state = request.args.get("state")
    if not code:
        return _oauth_error("GitHub 授权失败:未收到 code")
    if state != session.get("oauth_state"):
        return _oauth_error("OAuth state 不匹配,请重试")
    if session.get("oauth_provider") != "github":
        return _oauth_error("OAuth provider 不匹配")
    # exchange code for access token
    # 旧端点 github.com/login/oauth/access_token 在国内偶发超时,设长 timeout + helper 自带 2 次重试
    try:
        data = _oauth_http_json("POST", "https://github.com/login/oauth/access_token", data={
            "client_id": GITHUB_CLIENT_ID,
            "client_secret": GITHUB_CLIENT_SECRET,
            "code": code,
            "redirect_uri": APP_BASE_URL + "/api/auth/github/callback"
        }, label="github-token", timeout=30)
    except Exception as e:
        return _oauth_error(f"GitHub token 交换失败:{e}")
    token = data.get("access_token")
    if not token:
        return _oauth_error(f"GitHub 未返回 access_token:{data.get('error_description', data)}")
    # fetch user info
    try:
        u = _oauth_http_json("GET", "https://api.github.com/user", headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": "daily-ai-briefing"
        }, label="github-user", timeout=20)
    except Exception as e:
        return _oauth_error(f"GitHub user 拉取失败:{e}")
    session["user"] = {
        "id": str(u.get("id", "")),
        "login": u.get("login", ""),
        "name": u.get("name") or u.get("login", ""),
        "avatar": u.get("avatar_url", ""),
        "provider": "github",
        "profile": u.get("html_url", "")
    }
    session.pop("oauth_state", None)
    session.pop("oauth_provider", None)
    return redirect("/")

# ---------- Google OAuth ----------

@app.route("/api/auth/google")
def auth_google():
    if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET):
        return jsonify({"error": "Google OAuth 未配置,请联系管理员设置 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET"}), 503
    state = secrets.token_urlsafe(24)
    session["oauth_state"] = state
    session["oauth_provider"] = "google"
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": APP_BASE_URL + "/api/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account"
    }
    return redirect("https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params))

@app.route("/api/auth/google/callback")
def auth_google_callback():
    code = request.args.get("code")
    state = request.args.get("state")
    if not code:
        return _oauth_error("Google 授权失败:未收到 code")
    if state != session.get("oauth_state"):
        return _oauth_error("OAuth state 不匹配,请重试")
    if session.get("oauth_provider") != "google":
        return _oauth_error("OAuth provider 不匹配")
    try:
        data = _oauth_http_json("POST", "https://oauth2.googleapis.com/token", data=urllib.parse.urlencode({
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": APP_BASE_URL + "/api/auth/google/callback"
        }).encode("utf-8"), headers={"Content-Type": "application/x-www-form-urlencoded"}, label="google-token")
    except Exception as e:
        return _oauth_error(f"Google token 交换失败:{e}")
    token = data.get("access_token")
    if not token:
        return _oauth_error(f"Google 未返回 access_token:{data.get('error_description', data)}")
    try:
        u = _oauth_http_json("GET", "https://www.googleapis.com/oauth2/v2/userinfo", headers={
            "Authorization": f"Bearer {token}"
        }, label="google-user")
    except Exception as e:
        return _oauth_error(f"Google user 拉取失败:{e}")
    session["user"] = {
        "id": str(u.get("id", "")),
        "login": u.get("email", ""),
        "name": u.get("name", "") or u.get("email", ""),
        "avatar": u.get("picture", ""),
        "email": u.get("email", ""),
        "provider": "google"
    }
    session.pop("oauth_state", None)
    session.pop("oauth_provider", None)
    return redirect("/")

def _oauth_error(msg):
    return Response(
        f"""<!doctype html><html><body style='font-family:system-ui;padding:3rem;text-align:center'>
        <h2 style='color:#c8102e'>登录失败</h2>
        <p>{html.escape(msg)}</p>
        <p style='margin-top:2rem'><a href='/' style='color:#c8102e'>返回首页</a></p>
        </body></html>""",
        status=400,
        content_type="text/html; charset=utf-8"
    )

@app.route("/")
def index():
    # SPA fallback:优先 web/dist/index.html,缺失则用旧的 feed.html
    dist_index = os.path.join(DIST_DIR, "index.html")
    if os.path.isfile(dist_index):
        return send_from_directory(DIST_DIR, "index.html")
    return send_from_directory(PUBLIC_DIR, "feed.html")

@app.route("/chat")
def chat_page():
    # 老 chat.html 走旧 public 路径
    return send_from_directory(PUBLIC_DIR, "chat.html")

# SPA fallback:把所有非 /api 的路径都交给 web/dist/index.html
# React Router 前端路由接管(/archive /topic/<slug> /category/<slug> /me 等)
# 同时支持 web/dist/assets/* 静态资源
@app.route("/<path:path>")
def spa_or_static(path):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    # 防路径穿越
    if ".." in path or path.startswith("/"):
        return jsonify({"error": "forbidden"}), 403
    # dist 存在 → 优先
    dist_index = os.path.join(DIST_DIR, "index.html")
    if os.path.isfile(dist_index):
        # 如果是带扩展名的文件,从 dist 取
        if "." in path.split("/")[-1]:
            dist_file = os.path.join(DIST_DIR, path)
            if os.path.isfile(dist_file):
                return send_from_directory(DIST_DIR, path)
        return send_from_directory(DIST_DIR, "index.html")
    # 回退:旧 public 静态资源
    return send_from_directory(PUBLIC_DIR, path)

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

# ===========================================================================
# 二级页面 API:专题 / 报告库 / 分类 / 个人中心
# ===========================================================================

# 专题元数据(3 个固定专题)
TOPICS_META = {
    "compute": {
        "slug": "compute",
        "title": "国产算力产业链",
        "sub": "国产芯片、服务器、存储与操作系统全景追踪",
        "keywords": ["国产", "芯片", "服务器", "存储", "操作系统", "寒武纪", "长鑫", "海光", "龙芯", "中科曙光", "浪潮", "华为", "鲲鹏", "昇腾", "麒麟", "统信", "openEuler"],
        "color": "#3a4576",
        "accent": "#1a2236"
    },
    "capex": {
        "slug": "capex",
        "title": "全球 AI 资本开支",
        "sub": "云厂商与互联网大厂投入对比与趋势",
        "keywords": ["资本开支", "capex", "云", "阿里云", "aws", "azure", "腾讯云", "百度云", "meta", "google", "微软", "亚马逊", "甲骨文"],
        "color": "#0a5a6a",
        "accent": "#1a4a5a"
    },
    "price": {
        "slug": "price",
        "title": "模型价格战",
        "sub": "大模型降价、开源与生态竞争格局",
        "keywords": ["模型", "大模型", "llm", "gpt", "claude", "gemini", "开源", "huggingface", "llama", "qwen", "文心", "豆包", "kimi", "价格", "降价", "token"],
        "color": "#5a1a3a",
        "accent": "#3a1a2a"
    }
}

CATEGORIES_META = {
    "ai": {"label": "AI", "sub": "大模型、算力、芯片、训练、推理、智能体", "kw": ["ai", "大模型", "llm", "gpt", "hbm", "算力", "训练", "推理", "智能体", "英伟达", "寒武纪", "长鑫", "阿里", "华为", "qwen", "claude", "gemini"]},
    "tech": {"label": "科技", "sub": "硬件、半导体、消费电子、机器人", "kw": ["芯片", "半导体", "台积电", "tsmc", "smic", "代工", "晶圆", "科技", "手机", "windows", "苹果", "特斯拉", "电动车", "机器人"]},
    "market": {"label": "市场", "sub": "股市、汇市、大宗、宏观、财报", "kw": ["a 股", "港股", "美股", "创业板", "科创", "恒生", "纳斯达克", "标普", "道琼斯", "涨", "跌", "市值", "融资", "配售", "ipo", "财报", "业绩", "资本", "市场", "经济", "美元", "人民币", "外汇", "债券"]},
    "policy": {"label": "政策", "sub": "监管、出口、补贴、立法", "kw": ["制裁", "出口", "许可", "实体清单", "监管", "政策", "国务院", "发改委", "央行", "美联储", "商务部", "外交部", "拜登", "特朗普", "补贴"]}
}

@app.route("/api/topics")
def topics_list():
    """返回 3 个专题元信息 + 当前每个专题的命中数"""
    try:
        all_items = (fetch_all_news() or {}).get("items", [])
        out = []
        for slug, meta in TOPICS_META.items():
            hits = [it for it in all_items if any(k in ((it.get("title") or "") + " " + (it.get("description") or "")) for k in meta["keywords"])]
            out.append({**meta, "count": len(hits)})
        return jsonify({"topics": out})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/topics/<slug>")
def topic_detail(slug):
    """单个专题:返回该专题的命中新闻 + 摘要"""
    meta = TOPICS_META.get(slug)
    if not meta:
        return jsonify({"error": "专题不存在"}), 404
    try:
        all_items = (fetch_all_news() or {}).get("items", [])
        hits = [it for it in all_items if any(k in ((it.get("title") or "") + " " + (it.get("description") or "")) for k in meta["keywords"])]
        # 加载 digest
        digest = None
        if os.path.exists(DIGEST_PATH):
            with open(DIGEST_PATH, "r", encoding="utf-8") as f:
                digest = json.load(f)
        return jsonify({
            "topic": meta,
            "items": hits[:20],
            "digest": digest,
            "count": len(hits)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/category/<slug>")
def category_detail(slug):
    meta = CATEGORIES_META.get(slug)
    if not meta:
        return jsonify({"error": "分类不存在"}), 404
    try:
        all_items = (fetch_all_news() or {}).get("items", [])
        hits = [it for it in all_items if any(k in ((it.get("title") or "") + " " + (it.get("description") or "")) for k in meta["kw"])]
        return jsonify({
            "category": {"slug": slug, **meta},
            "items": hits[:20],
            "count": len(hits)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/archive")
def archive_list():
    """历史简报列表:扫 data/digest-*.json + data/digest.json"""
    data_dir = os.path.join(APP_DIR, "data")
    files = []
    if os.path.isdir(data_dir):
        for f in sorted(os.listdir(data_dir)):
            if f.startswith("digest") and f.endswith(".json"):
                files.append(os.path.join(data_dir, f))
    files.sort(key=os.path.getmtime if os.path.exists else lambda x: 0, reverse=True)
    out = []
    for fp in files:
        try:
            with open(fp, "r", encoding="utf-8") as fh:
                d = json.load(fh)
            out.append({
                "file": os.path.basename(fp),
                "date": d.get("digestDate", ""),
                "title": d.get("title", ""),
                "summary": (d.get("summary", "") or "")[:160],
                "marketSentiment": d.get("marketSentiment", ""),
                "aiSentiment": d.get("aiSentiment", ""),
                "size": os.path.getsize(fp),
                "mtime": datetime.fromtimestamp(os.path.getmtime(fp), tz=timezone.utc).isoformat()
            })
        except Exception:
            pass
    return jsonify({"items": out, "count": len(out)})

# ---------- 用户数据持久化(SQLite · Python stdlib,易迁移) ----------

import sqlite3
import threading

DB_PATH = os.path.join(APP_DIR, "data", "users.db")
_db_lock = threading.Lock()
_db_conn = None

def _db():
    """获取全局 SQLite 连接(WAL 模式 + check_same_thread=False)"""
    global _db_conn
    if _db_conn is None:
        _db_conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
        _db_conn.execute("PRAGMA journal_mode=WAL")
        _db_conn.execute("PRAGMA foreign_keys=ON")
        _db_init_schema(_db_conn)
    return _db_conn

def _db_init_schema(conn):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        login TEXT,
        name TEXT,
        email TEXT,
        avatar TEXT,
        profile TEXT,
        created_at TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        PRIMARY KEY (provider, external_id)
    );
    CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        UNIQUE(provider, external_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(provider, external_id, saved_at DESC);
    CREATE TABLE IF NOT EXISTS followed_topics (
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (provider, external_id, topic)
    );
    CREATE INDEX IF NOT EXISTS idx_followed_user ON followed_topics(provider, external_id);
    """)
    conn.commit()

def _user_upsert_from_session(conn):
    """把 session['user'] 同步到 users 表(如果字段变化就更新)"""
    u = session.get("user")
    if not u: return None
    pid = u.get("provider", "?")
    eid = str(u.get("id") or u.get("login") or "")
    if not eid: return None
    now = datetime.now(tz=timezone.utc).isoformat()
    cur = conn.execute("SELECT created_at FROM users WHERE provider=? AND external_id=?", (pid, eid))
    row = cur.fetchone()
    if row is None:
        conn.execute("""INSERT INTO users(provider, external_id, login, name, email, avatar, profile, created_at, last_seen)
                        VALUES (?,?,?,?,?,?,?,?,?)""",
                     (pid, eid, u.get("login"), u.get("name"), u.get("email"),
                      u.get("avatar"), u.get("profile"), now, now))
    else:
        conn.execute("""UPDATE users SET login=?, name=?, email=?, avatar=?, profile=?, last_seen=?
                        WHERE provider=? AND external_id=?""",
                     (u.get("login"), u.get("name"), u.get("email"),
                      u.get("avatar"), u.get("profile"), now, pid, eid))
    conn.commit()
    return (pid, eid)

def _user_id_from_session():
    u = session.get("user")
    if not u: return None
    return (u.get("provider", "?"), str(u.get("id") or u.get("login") or ""))

def _require_user():
    pair = _user_id_from_session()
    if not pair or not pair[1]:
        return None, (jsonify({"error": "未登录"}), 401)
    return pair, None

@app.route("/api/me")
def me():
    pair = _user_id_from_session()
    if not pair or not pair[1]:
        return jsonify({"user": None, "data": {"collections": [], "followed": []}})
    with _db_lock:
        conn = _db()
        _user_upsert_from_session(conn)
        # collections
        rows = conn.execute("""SELECT item_id, payload, saved_at FROM collections
                               WHERE provider=? AND external_id=? ORDER BY id DESC LIMIT 200""",
                            pair).fetchall()
        cols = [{"id": r[0], **json.loads(r[1]), "savedAt": r[2]} for r in rows]
        # followed
        frows = conn.execute("""SELECT topic, created_at FROM followed_topics
                                WHERE provider=? AND external_id=? ORDER BY created_at""",
                             pair).fetchall()
        followed = [r[0] for r in frows]
        return jsonify({"user": session.get("user"), "data": {"collections": cols, "followed": followed}, "id": f"{pair[0]}:{pair[1]}"})

@app.route("/api/me/collections", methods=["GET", "POST", "DELETE"])
def me_collections():
    pair, err = _require_user()
    if err: return err
    with _db_lock:
        conn = _db()
        _user_upsert_from_session(conn)
        if request.method == "GET":
            rows = conn.execute("""SELECT item_id, payload, saved_at FROM collections
                                   WHERE provider=? AND external_id=? ORDER BY id DESC LIMIT 200""",
                                pair).fetchall()
            cols = [{"id": r[0], **json.loads(r[1]), "savedAt": r[2]} for r in rows]
            return jsonify({"collections": cols})
        body = request.get_json(silent=True) or {}
        item = body.get("item") or {}
        if not item.get("id"):
            return jsonify({"error": "需要 item.id"}), 400
        now = datetime.now(tz=timezone.utc).isoformat()
        if request.method == "POST":
            try:
                conn.execute("""INSERT INTO collections(provider, external_id, item_id, payload, saved_at)
                                VALUES (?,?,?,?,?)""",
                             (*pair, item["id"], json.dumps(item, ensure_ascii=False), now))
                conn.commit()
            except sqlite3.IntegrityError:
                pass  # 已存在
            rows = conn.execute("""SELECT item_id, payload, saved_at FROM collections
                                   WHERE provider=? AND external_id=? ORDER BY id DESC LIMIT 200""",
                                pair).fetchall()
            return jsonify({"ok": True, "collections": [{"id": r[0], **json.loads(r[1]), "savedAt": r[2]} for r in rows]})
        # DELETE
        conn.execute("""DELETE FROM collections WHERE provider=? AND external_id=? AND item_id=?""",
                     (*pair, item.get("id", "")))
        conn.commit()
        rows = conn.execute("""SELECT item_id, payload, saved_at FROM collections
                               WHERE provider=? AND external_id=? ORDER BY id DESC LIMIT 200""",
                            pair).fetchall()
        return jsonify({"ok": True, "collections": [{"id": r[0], **json.loads(r[1]), "savedAt": r[2]} for r in rows]})

@app.route("/api/me/follow", methods=["GET", "POST", "DELETE"])
def me_follow():
    pair, err = _require_user()
    if err: return err
    with _db_lock:
        conn = _db()
        _user_upsert_from_session(conn)
        if request.method == "GET":
            rows = conn.execute("""SELECT topic FROM followed_topics
                                   WHERE provider=? AND external_id=? ORDER BY created_at""",
                                pair).fetchall()
            return jsonify({"followed": [r[0] for r in rows]})
        body = request.get_json(silent=True) or {}
        topic = body.get("topic", "")
        if not topic:
            return jsonify({"error": "需要 topic"}), 400
        now = datetime.now(tz=timezone.utc).isoformat()
        if request.method == "POST":
            try:
                conn.execute("""INSERT INTO followed_topics(provider, external_id, topic, created_at)
                                VALUES (?,?,?,?)""", (*pair, topic, now))
                conn.commit()
            except sqlite3.IntegrityError:
                pass
        else:
            conn.execute("""DELETE FROM followed_topics WHERE provider=? AND external_id=? AND topic=?""",
                         (*pair, topic))
            conn.commit()
        rows = conn.execute("""SELECT topic FROM followed_topics
                               WHERE provider=? AND external_id=? ORDER BY created_at""",
                            pair).fetchall()
        return jsonify({"ok": True, "followed": [r[0] for r in rows]})

# ---------- 启动 ----------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3535))
    host = os.environ.get("HOST", "0.0.0.0")
    print("[daily-ai-briefing] starting on {}:{}".format(host, port))
    print("[daily-ai-briefing] api_key set: {}, model: {}".format(bool(get_api_key()), get_model()))
    print("[daily-ai-briefing] cache: DISABLED(每次实时拉)")
    app.run(host=host, port=port, threaded=True, debug=False)
