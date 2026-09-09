"""
server/invest_data.py
投资模块的离线数据池 —— 行情 mock + A 股基础池 + 8 宏观标的
纯 stdlib,零依赖,可在 dev / 离线环境直接用
"""

import time
import hashlib

# ─── 8 个宏观标的(指数 + 宏观商品)────────────────
MACRO_BASE = {
    "sh000001": {"name": "上证指数", "base": 3200.0, "vol": 0.004, "kind": "index"},
    "sz399001": {"name": "深证成指", "base": 10500.0, "vol": 0.005, "kind": "index"},
    "sz399006": {"name": "创业板指", "base": 2100.0, "vol": 0.007, "kind": "index"},
    "hkHSI":     {"name": "恒生指数", "base": 18500.0, "vol": 0.006, "kind": "index"},
    "usIXIC":    {"name": "纳斯达克", "base": 17800.0, "vol": 0.005, "kind": "index"},
    "au2512":    {"name": "黄金期货", "base": 2350.0, "vol": 0.005, "kind": "commodity"},
    "cl2512":    {"name": "WTI 原油", "base": 78.0, "vol": 0.008, "kind": "commodity"},
    "btc":       {"name": "比特币",   "base": 65000.0, "vol": 0.012, "kind": "crypto"},
}

# ─── A 股池(用于自选/策略命中展示)────────────────
# 选取标准:沪深 300 内流动性较好的样本 + 几个 AI/新能源热门
A_SHARE_POOL = [
    {"symbol": "sh600519", "name": "贵州茅台", "base": 1620.0, "pe": 28.5, "pb": 9.2, "divYield": 1.6, "sector": "消费"},
    {"symbol": "sh600036", "name": "招商银行", "base": 35.8, "pe": 6.1, "pb": 0.85, "divYield": 5.8, "sector": "金融"},
    {"symbol": "sh601318", "name": "中国平安", "base": 48.2, "pe": 8.9, "pb": 0.92, "divYield": 4.5, "sector": "金融"},
    {"symbol": "sz000858", "name": "五粮液",   "base": 142.0, "pe": 16.2, "pb": 4.1, "divYield": 2.8, "sector": "消费"},
    {"symbol": "sz000333", "name": "美的集团", "base": 72.0, "pe": 13.8, "pb": 2.6, "divYield": 3.5, "sector": "家电"},
    {"symbol": "sh601398", "name": "工商银行", "base": 6.4, "pe": 5.8, "pb": 0.62, "divYield": 6.1, "sector": "金融"},
    {"symbol": "sh600900", "name": "长江电力", "base": 28.5, "pe": 18.2, "pb": 3.1, "divYield": 4.2, "sector": "公用事业"},
    {"symbol": "sh600028", "name": "中国石化", "base": 6.8, "pe": 9.5, "pb": 0.88, "divYield": 5.5, "sector": "能源"},
    {"symbol": "sz000651", "name": "格力电器", "base": 42.0, "pe": 8.2, "pb": 1.85, "divYield": 8.5, "sector": "家电"},
    {"symbol": "sh600887", "name": "伊利股份", "base": 26.5, "pe": 14.5, "pb": 2.9, "divYield": 4.0, "sector": "消费"},
    {"symbol": "sh601088", "name": "中国神华", "base": 38.0, "pe": 9.8, "pb": 1.55, "divYield": 5.8, "sector": "能源"},
    {"symbol": "sz002594", "name": "比亚迪",   "base": 240.0, "pe": 22.5, "pb": 4.2, "divYield": 0.5, "sector": "汽车"},
    {"symbol": "sh600276", "name": "恒瑞医药", "base": 48.0, "pe": 38.0, "pb": 4.5, "divYield": 0.3, "sector": "医药"},
    {"symbol": "sz000063", "name": "中兴通讯", "base": 28.0, "pe": 14.5, "pb": 2.0, "divYield": 1.2, "sector": "通信"},
    {"symbol": "sh601012", "name": "隆基绿能", "base": 18.0, "pe": -15.0, "pb": 1.8, "divYield": 0.0, "sector": "新能源"},
    {"symbol": "sz300750", "name": "宁德时代", "base": 215.0, "pe": 19.8, "pb": 4.1, "divYield": 0.8, "sector": "新能源"},
    {"symbol": "sh600050", "name": "中国联通", "base": 5.2, "pe": 12.0, "pb": 0.75, "divYield": 3.2, "sector": "通信"},
    {"symbol": "sz000001", "name": "平安银行", "base": 11.5, "pe": 5.2, "pb": 0.55, "divYield": 5.5, "sector": "金融"},
    {"symbol": "sh601800", "name": "中国交建", "base": 9.8, "pe": 5.8, "pb": 0.62, "divYield": 3.8, "sector": "基建"},
    {"symbol": "sz002475", "name": "立讯精密", "base": 38.0, "pe": 22.0, "pb": 3.8, "divYield": 0.5, "sector": "电子"},
]

DEFENSIVE_SECTORS = {"金融", "公用事业", "能源", "基建"}


def _seeded_rand(symbol, salt):
    """基于 symbol + salt 的稳定伪随机(返回 [-0.5, 0.5])"""
    h = hashlib.md5((symbol + ":" + salt).encode("utf-8")).hexdigest()
    return (int(h[:8], 16) % 10000) / 10000.0 - 0.5


def _pick_base(symbol):
    if symbol in MACRO_BASE:
        m = MACRO_BASE[symbol]
        return {"name": m["name"], "base": m["base"], "vol": m["vol"], "kind": m["kind"]}
    for s in A_SHARE_POOL:
        if s["symbol"] == symbol:
            return {"name": s["name"], "base": s["base"], "vol": 0.012, "kind": "stock"}
    # 未知 symbol:hash 出一个稳定价
    h = sum(ord(c) for c in symbol)
    return {"name": symbol, "base": 10.0 + (h % 90), "vol": 0.012, "kind": "stock"}


def mock_quote(symbol):
    """生成稳定 + 微波动的 mock 行情(5 分钟桶)"""
    meta = _pick_base(symbol)
    bucket = int(time.time() // (5 * 60))
    drift = _seeded_rand(symbol, str(bucket)) * meta["vol"]
    price = round(meta["base"] * (1 + drift), 2 if meta["kind"] != "crypto" else 0)
    prev = round(meta["base"] * (1 + _seeded_rand(symbol, str(bucket - 1)) * meta["vol"] * 0.8), 2)
    change = round(price - prev, 2)
    change_pct = round((change / prev) * 100, 2) if prev else 0.0
    return {
        "symbol": symbol,
        "name": meta["name"],
        "price": price,
        "change": change,
        "changePct": change_pct,
        "open": round(prev * 1.002, 2),
        "high": round(price * 1.008, 2),
        "low": round(price * 0.992, 2),
        "volume": int(1_000_000 + abs(_seeded_rand(symbol, "vol")) * 50_000_000),
        "ts": int(time.time() * 1000),
        "source": "mock",
        "kind": meta["kind"],
    }


def mock_quotes(symbols):
    return [mock_quote(s) for s in symbols]


def get_a_share_pool():
    """给策略层用的增强版 A 股池(含 ma60 和 defensive 标记)"""
    out = []
    for s in A_SHARE_POOL:
        close = s["base"]
        # 稳定 hash 决定 ma60 偏离度
        deviation = _seeded_rand(s["symbol"], "ma60") * 0.16
        ma60 = round(close * (0.92 + abs(deviation)), 2)
        out.append({
            **s,
            "close": close,
            "ma60": ma60,
            "closeVsMa60": round((close - ma60) / ma60 * 100, 2),
            "isDefensive": s["sector"] in DEFENSIVE_SECTORS,
        })
    return out


def get_macro_universe():
    return [{"symbol": k, "name": v["name"], "kind": v["kind"]} for k, v in MACRO_BASE.items()]
