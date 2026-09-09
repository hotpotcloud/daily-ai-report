"""
server/invest_quotes.py
行情抓取层:eastmoney HTTP(免 key) + CoinGecko(加密) + 内存缓存 + mock 兜底
全 stdlib,5s 超时,失败即降级
"""

import json
import time
import urllib.request
import urllib.error

from .invest_data import mock_quote

# eastmoney push2 secid 映射
EAST_MONEY_SECID = {
    "sh000001": "1.000001",
    "sz399001": "0.399001",
    "sz399006": "0.399006",
    "hkHSI": "100.HSI",
    "usIXIC": "105.IXIC",
    "au2512": "113.au2512",
    "cl2512": "113.cl2512",
}

# CoinGecko 加密映射
CRYPTO_IDS = {"btc": "bitcoin"}

# 内存缓存
_mem_cache = {}
_TTL_MS = 60 * 1000  # 60s


def _http_get_json(url, headers=None, timeout=5):
    req = urllib.request.Request(url, headers=headers or {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://quote.eastmoney.com/",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", errors="replace"))


def _fetch_east_money(symbol):
    secid = EAST_MONEY_SECID.get(symbol)
    if not secid:
        return None
    url = (
        "https://push2.eastmoney.com/api/qt/stock/get"
        f"?secid={secid}&fields=f43,f44,f45,f46,f48,f60,f57,f58,f162,f167,f168,f169,f170,f171,f86,f107,f292"
    )
    try:
        j = _http_get_json(url, timeout=5)
    except (urllib.error.URLError, TimeoutError, ValueError, Exception):
        return None
    d = (j or {}).get("data")
    if not d:
        return None
    price = (d.get("f43") or 0) / 100.0
    prev_close = (d.get("f60") or 0) / 100.0
    open_p = (d.get("f46") or 0) / 100.0
    high = (d.get("f44") or 0) / 100.0
    low = (d.get("f45") or 0) / 100.0
    change = round(price - prev_close, 2)
    change_pct = round(((price - prev_close) / prev_close) * 100, 2) if prev_close > 0 else 0.0
    return {
        "symbol": symbol,
        "name": d.get("f58") or symbol,
        "price": price,
        "change": change,
        "changePct": change_pct,
        "open": open_p,
        "high": high,
        "low": low,
        "volume": d.get("f86") or 0,
        "turnover": d.get("f107") or 0,
        "pe": round(d["f162"] / 100.0, 2) if d.get("f162") else None,
        "pb": round(d["f167"] / 100.0, 2) if d.get("f167") else None,
        # 注:eastmoney f57 对股票是代码、对指数是 ID,不是市值,这里不暴露
        "ts": int(time.time() * 1000),
        "source": "eastmoney",
    }


def _fetch_coingecko(symbol):
    cid = CRYPTO_IDS.get(symbol)
    if not cid:
        return None
    url = f"https://api.coingecko.com/api/v3/simple/price?ids={cid}&vs_currencies=usd&include_24hr_change=true"
    try:
        j = _http_get_json(url, timeout=5)
    except (urllib.error.URLError, TimeoutError, ValueError, Exception):
        return None
    d = (j or {}).get(cid)
    if not d:
        return None
    price = d.get("usd", 0)
    change_pct = round(d.get("usd_24h_change") or 0, 2)
    change = round(price * (change_pct / 100.0), 2)
    return {
        "symbol": symbol,
        "name": "比特币" if symbol.upper() == "BTC" else symbol,
        "price": price,
        "change": change,
        "changePct": change_pct,
        "open": None, "high": None, "low": None,
        "volume": 0,
        "ts": int(time.time() * 1000),
        "source": "coingecko",
    }


def fetch_one(symbol):
    """返回 (data, source, ts)"""
    now = int(time.time() * 1000)
    cached = _mem_cache.get(symbol)
    if cached and now - cached["ts"] < _TTL_MS:
        return cached["data"], "live", cached["ts"]

    # 真实 API
    data = None
    if symbol in EAST_MONEY_SECID:
        data = _fetch_east_money(symbol)
    elif symbol in CRYPTO_IDS:
        data = _fetch_coingecko(symbol)

    if data:
        _mem_cache[symbol] = {"data": data, "ts": now}
        return data, "live", now

    # stale 缓存
    if cached:
        return cached["data"], "stale", cached["ts"]

    # mock 兜底
    data = mock_quote(symbol)
    _mem_cache[symbol] = {"data": data, "ts": now}
    return data, "mock", now


def fetch_quote(symbol):
    return fetch_one(symbol)


def fetch_quotes(symbols):
    return [fetch_one(s) for s in symbols]


def fetch_kline(symbol, period="day", range_="3M"):
    """K 线数据,返回 [ts, open, close, high, low, vol] 数组"""
    secid = EAST_MONEY_SECID.get(symbol)
    if not secid:
        return _fallback_kline(symbol, period, range_)

    # period 映射到 eastmoney klt
    klt_map = {"day": "101", "week": "102", "month": "103", "5min": "5", "15min": "15", "30min": "30", "60min": "60"}
    klt = klt_map.get(period, "101")

    # range 映射到 count
    count_map = {"1W": 5, "1M": 22, "3M": 65, "6M": 130, "1Y": 250, "3Y": 750, "5Y": 1250}
    count = count_map.get(range_, 65)

    url = (
        f"https://push2his.eastmoney.com/api/qt/stock/kline/get"
        f"?secid={secid}&fields1=fqt&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59"
        f"&klt={klt}&fqt=1&end=20500101&lmt={count}"
    )
    try:
        j = _http_get_json(url, timeout=8)
    except (urllib.error.URLError, TimeoutError, ValueError, Exception):
        return _fallback_kline(symbol, period, count)

    data = (j or {}).get("data") or {}
    name = data.get("name") or symbol
    klines = data.get("klines") or []
    candles = []
    for line in klines:
        # line = "2024-01-02,open,close,high,low,vol,amount,amp,chg,chgAmt,turnover"
        parts = line.split(",")
        if len(parts) < 6:
            continue
        try:
            # 日期可能是 "2024-01-02" 或时间戳
            date_str = parts[0]
            if "-" in date_str:
                from datetime import datetime
                ts = int(datetime.strptime(date_str, "%Y-%m-%d").timestamp() * 1000)
            else:
                ts = int(float(date_str))
        except Exception:
            continue
        try:
            o, c, h, l, v = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4]), float(parts[5])
        except (ValueError, IndexError):
            continue
        candles.append([ts, o, c, h, l, v])

    if not candles:
        return _fallback_kline(symbol, period, count)

    return {
        "symbol": symbol,
        "name": name,
        "period": period,
        "range": range_,
        "candles": candles,
        "source": "eastmoney",
        "ts": int(time.time() * 1000),
    }


def _fallback_kline(symbol, period, range_):
    """K 线兜底:用 mock 行情生成"""
    from .invest_data import mock_quote
    import random
    base = mock_quote(symbol)
    price = base["price"]
    count_map = {"1W": 5, "1M": 22, "3M": 65, "6M": 130, "1Y": 250, "3Y": 750, "5Y": 1250}
    count = count_map.get(range_, 65)
    candles = []
    now_ms = int(time.time() * 1000)
    for i in range(count - 1, -1, -1):
        drift = (random.random() - 0.5) * 0.04
        p = price * (1 - drift * i / 30)
        candles.append([now_ms - i * 86400000, p, p, p * 1.005, p * 0.995, 0])
    return {
        "symbol": symbol, "name": base["name"], "period": period, "range": range_,
        "candles": candles, "source": "mock", "ts": now_ms,
    }


def fetch_spark(symbol, days=30):
    """返回最近 N 天的收盘价数组(用于宏观卡 sparkline)"""
    range_map = {5: "1W", 22: "1M", 65: "3M"}
    rng = range_map.get(days, "3M")
    k = fetch_kline(symbol, period="day", range_=rng)
    closes = [c[2] for c in k.get("candles", [])][-days:]
    if not closes:
        from .invest_data import mock_quote
        m = mock_quote(symbol)
        closes = [m["price"]] * days
    return closes


def fetch_sparks(symbols, days=30):
    """批量 sparkline"""
    out = {}
    for s in symbols:
        try:
            out[s] = fetch_spark(s, days)
        except Exception:
            from .invest_data import mock_quote
            m = mock_quote(s)
            out[s] = [m["price"]] * days
    return out
