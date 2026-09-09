"""
server/invest_strategies.py
3 套"不同风格"策略:硬编码定义 + 命中计算 + 历史回溯 + 启动 seed
"""

import json
import time

from .invest_data import get_a_share_pool
from .invest_quotes import fetch_quotes

STRATEGY_DEFS = [
    {
        "slug": "value",
        "title": "价值低估值",
        "subtitle": "PE<20 + PB<3 + 股息率>2%",
        "category": "value",
        "philosophy": (
            "买入被市场低估的成熟公司。逻辑:盈利稳定、资产扎实、股息有保障,"
            "适合长期持有等待估值修复。本期筛选沪深 300 范围内的金融/消费/能源龙头,"
            "用 PE / PB / 股息率三重过滤掉题材股。"
        ),
        "rules": [
            {"metric": "pe", "op": "lt", "value": 20},
            {"metric": "pb", "op": "lt", "value": 3},
            {"metric": "divYield", "op": "gt", "value": 2},
        ],
    },
    {
        "slug": "trend",
        "title": "趋势多头",
        "subtitle": "收盘价站上 60 日均线",
        "category": "trend",
        "philosophy": (
            "顺势而为。股价站上 60 日均线说明中期趋势向上,继续持有概率大于回调。"
            "本期样本是 A 股中市值较大、流动性较好的标的,均线参数固定 60 日。"
        ),
        "rules": [{"metric": "closeVsMa60", "op": "gt", "value": 0}],
    },
    {
        "slug": "defensive",
        "title": "防御配置",
        "subtitle": "公用事业 + 高股息(>4%)",
        "category": "defensive",
        "philosophy": (
            "市场不好时抗跌。逻辑:水电燃气、银行、能源、基建这些行业受经济周期影响小,"
            "股息率普遍 4% 以上,下跌空间有限、底部有票息保护。"
        ),
        "rules": [
            {"metric": "sector", "op": "in", "value": ["金融", "公用事业", "能源", "基建"]},
            {"metric": "divYield", "op": "gt", "value": 4},
        ],
    },
]


def _evaluate(stock, rules):
    for r in rules:
        v = stock.get(r["metric"])
        if v is None:
            return False
        if r["op"] == "lt" and not (v < r["value"]):
            return False
        if r["op"] == "gt" and not (v > r["value"]):
            return False
        if r["op"] == "in" and v not in r["value"]:
            return False
    return True


def _hits_for(slug):
    for s in STRATEGY_DEFS:
        if s["slug"] == slug:
            return [x for x in get_a_share_pool() if _evaluate(x, s["rules"])]
    return []


def ensure_seeded(conn):
    """启动时 seed 3 套策略到 DB(幂等)"""
    now = int(time.time() * 1000)
    for s in STRATEGY_DEFS:
        conn.execute(
            """
            INSERT INTO strategies(slug, title, subtitle, category, philosophy, rules, created_at)
            VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(slug) DO UPDATE SET
              title=excluded.title,
              subtitle=excluded.subtitle,
              category=excluded.category,
              philosophy=excluded.philosophy,
              rules=excluded.rules
            """,
            (s["slug"], s["title"], s["subtitle"], s["category"], s["philosophy"], json.dumps(s["rules"], ensure_ascii=False), now),
        )
    conn.commit()


def list_strategies():
    return [
        {
            "slug": s["slug"],
            "title": s["title"],
            "subtitle": s["subtitle"],
            "category": s["category"],
            "hitCount": len(_hits_for(s["slug"])),
        }
        for s in STRATEGY_DEFS
    ]


def get_strategy(slug):
    for s in STRATEGY_DEFS:
        if s["slug"] == slug:
            return s
    return None


def compute_hits(slug):
    """当前命中(行情填充)"""
    matched = _hits_for(slug)
    if not matched:
        return []
    symbols = [m["symbol"] for m in matched]
    quotes = fetch_quotes(symbols)
    today = time.strftime("%Y-%m-%d")
    out = []
    for m, q in zip(matched, quotes):
        data, source, ts = q
        out.append({
            "symbol": m["symbol"],
            "name": m["name"],
            "sector": m["sector"],
            "pe": m["pe"],
            "pb": m["pb"],
            "divYield": m["divYield"],
            "signalDate": today,
            "signalPrice": data.get("price", m["base"]),
            "currentPrice": data.get("price", m["base"]),
            "returnPct": data.get("changePct", 0),
            "source": source,
        })
    return out


def history_hits(slug, range_days=30):
    """历史回溯(伪时间序列)"""
    matched = _hits_for(slug)
    if not matched:
        return []
    symbols = [m["symbol"] for m in matched]
    quotes = fetch_quotes(symbols)
    out = []
    now_ms = int(time.time() * 1000)
    for d in range(range_days, 0, -1):
        date = time.strftime("%Y-%m-%d", time.localtime(now_ms / 1000 - d * 24 * 3600))
        for m, q in zip(matched, quotes):
            data, source, ts = q
            current = data.get("price", m["base"])
            change_pct = data.get("changePct", 0)
            signal_price = round(current * (1 - (change_pct / 100.0) * (d / range_days)), 2)
            out.append({
                "symbol": m["symbol"],
                "name": m["name"],
                "signalDate": date,
                "signalPrice": signal_price,
                "currentPrice": round(current, 2),
                "returnPct": round(((current - signal_price) / signal_price) * 100, 2) if signal_price > 0 else 0,
            })
    out.sort(key=lambda x: x["signalDate"], reverse=True)
    return out
