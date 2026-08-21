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

USER_AGENT = "Mozilla/5.0 (compatible; DailyAIBriefing/1.0)"

RSS_SOURCES = [
    {
        "name": "Google News · AI(中文)",
        "url": "https://news.google.com/rss/search?q=AI+%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
        "category": "ai"
    },
    {
        "name": "Google News · 财经(中文)",
        "url": "https://news.google.com/rss/search?q=%E8%82%A1%E5%B8%82+%E9%87%91%E8%9E%8D&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
        "category": "market"
    },
    {
        "name": "Google News · 半导体(中文)",
        "url": "https://news.google.com/rss/search?q=%E5%8D%8A%E5%AF%BC%E4%BD%93+%E8%8A%AF%E7%89%87&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
        "category": "market"
    },
    {
        "name": "Hacker News · frontpage",
        "url": "https://hnrss.org/frontpage?count=15",
        "category": "ai"
    }
]

# ---------- 配置读取(只走环境变量,零缓存) ----------

def get_api_key():
    return os.environ.get("MINIMAX_API_KEY", "").strip()

def get_base_url():
    return os.environ.get("MINIMAX_BASE_URL", DEFAULT_BASE_URL).rstrip("/")

def get_model():
    return os.environ.get("MINIMAX_MODEL", DEFAULT_MODEL)

# ---------- RSS 抓取(每次请求实时拉,零缓存) ----------

def fetch_url(url, timeout=12):
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, text/xml, */*"
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")

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
        desc = strip_html(d.text if d is not None and d.text else "")[:400]
        if title and link:
            items.append({
                "title": title,
                "link": link,
                "publishedAt": pub,
                "description": desc
            })
    return items

def fetch_source(source):
    try:
        xml = fetch_url(source["url"])
        items = parse_rss(xml)
        return [
            {"source": source["name"], "category": source["category"], **it}
            for it in items[:10]
        ]
    except Exception as e:
        return None

def fetch_all_news():
    results = []
    failed = []
    # 并发抓取,避免单源慢导致整体超时
    with ThreadPoolExecutor(max_workers=len(RSS_SOURCES)) as ex:
        futures = {ex.submit(fetch_source, src): src for src in RSS_SOURCES}
        for fut in as_completed(futures):
            src = futures[fut]
            try:
                r = fut.result(timeout=20)
            except Exception as e:
                r = None
            if r is None:
                failed.append({"source": src["name"], "error": "fetch failed"})
            else:
                results.extend(r)

    def sort_key(item):
        try:
            ts = item.get("publishedAt", "")
            if ts:
                return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
        except Exception:
            pass
        return 0

    results.sort(key=sort_key, reverse=True)
    return {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "totals": {"all": len(results)},
        "failedSources": failed,
        "items": results[:30]
    }

# ---------- M3 chat 调用 ----------

def build_chat_messages(user_messages):
    """注入实时新闻到 system prompt。"""
    news = fetch_all_news()
    lines = []
    for it in news.get("items", [])[:15]:
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
