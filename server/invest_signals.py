"""
server/invest_signals.py
从最新日报的 marketItems / aiItems 衍生"今日投资信号"
不做 ML,只做关键词抽取 + 简单情绪分类
"""

import json
import os
import re
from datetime import datetime, timezone

DIGEST_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "digest.json")

CODE_RE = re.compile(r"\b[036]\d{5}\b|\bSH\d{6}\b|\bSZ\d{6}\b", re.IGNORECASE)

KEY_COMPANIES = [
    ("英伟达", "NVDA · 算力"),
    ("寒武纪", "688256 · 国产 AI 芯片"),
    ("海光",   "688041 · 国产 CPU"),
    ("中芯",   "0981.HK / 688981 · 晶圆代工"),
    ("台积",   "TSM · 晶圆代工龙头"),
    ("比亚迪", "002594 · 新能源车"),
    ("宁德",   "300750 · 动力电池"),
    ("茅台",   "600519 · 消费龙头"),
    ("阿里",   "BABA · 互联网"),
    ("腾讯",   "0700.HK · 互联网"),
    ("半导体", "板块 · 半导体景气"),
    ("HBM",    "存储 · 高带宽内存"),
    ("机器人", "板块 · 具身智能"),
]

BULL_KW = re.compile(r"涨|新高|突破|利好|超预期|走强|加仓|增持")
BEAR_KW = re.compile(r"跌|回调|承压|不及预期|走弱|风险|减仓|减持")


def _extract_symbols(text):
    if not text:
        return []
    codes = [c.upper() for c in CODE_RE.findall(text)]
    tags = [tag for kw, tag in KEY_COMPANIES if kw in text]
    seen = []
    for x in codes + tags:
        if x not in seen:
            seen.append(x)
        if len(seen) >= 6:
            break
    return seen


def _pick_type(text):
    if not text:
        return "info"
    if BULL_KW.search(text):
        return "bull"
    if BEAR_KW.search(text):
        return "bear"
    return "info"


def _load_digest():
    if not os.path.exists(DIGEST_PATH):
        return None
    try:
        with open(DIGEST_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def derive_from_digest(digest):
    if not digest:
        return []
    out = []
    items = []
    if isinstance(digest.get("marketItems"), list):
        items.extend(digest["marketItems"])
    if isinstance(digest.get("aiItems"), list):
        items.extend(digest["aiItems"])
    digest_date = digest.get("digestDate") or datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")

    for i, seg in enumerate(items[:6]):
        if isinstance(seg, str):
            text, title = seg, ""
        elif isinstance(seg, dict):
            text = seg.get("content") or ""
            title = seg.get("title") or ""
        else:
            continue
        if not text:
            continue
        # 标题用第一句
        first = re.split(r"[,，。;;\n]", text)[0][:24]
        out.append({
            "id": f"sig-{digest_date}-{i}",
            "type": _pick_type(text),
            "title": title or first or "今日信号",
            "hint": text[:120],
            "relatedSymbols": _extract_symbols(text),
        })
    return out


def today_signals():
    return derive_from_digest(_load_digest())
