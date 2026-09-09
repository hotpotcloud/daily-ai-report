// server/quotes.js
// 行情抓取层:eastmoney HTTP 抓取 + 内存/SQLite 双层缓存 + mock 兜底
// 所有方法返回:{ data, source: "live"|"stale"|"mock", ts }

import { mockQuote } from "./mockQuotes.js";

// 8 个宏观标的的 secid 映射(只用于 eastmoney)
const EAST_MONEY_SECID = {
  sh000001: "1.000001",
  sz399001: "0.399001",
  sz399006: "0.399006",
  hkHSI: "100.HSI",
  usIXIC: "105.IXIC",
  au2512: "113.au2512",
  cl2512: "113.cl2512"
};

// 内存缓存(symbol -> {data, source, ts})
const memCache = new Map();
const TTL_LIVE_MS = 60 * 1000; // 60s

// CoinGecko 加密
const CRYPTO_IDS = { btc: "bitcoin" };
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids={id}&vs_currencies=usd&include_24hr_change=true";

async function fetchFromEastMoney(symbol) {
  const secid = EAST_MONEY_SECID[symbol];
  if (!secid) return null;
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f48,f60,f57,f58,f162,f167,f168,f169,f170,f171,f86,f107,f292`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" }
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.data) return null;
    const d = j.data;
    const price = (d.f43 ?? 0) / 100;          // 最新价(分→元)
    const prevClose = (d.f60 ?? 0) / 100;      // 昨收
    const open = (d.f46 ?? 0) / 100;
    const high = (d.f44 ?? 0) / 100;
    const low = (d.f45 ?? 0) / 100;
    const change = +(price - prevClose).toFixed(2);
    const changePct = prevClose > 0 ? +(((price - prevClose) / prevClose) * 100).toFixed(2) : 0;
    return {
      symbol,
      name: d.f58 || symbol,
      price,
      change,
      changePct,
      open,
      high,
      low,
      volume: d.f86 ?? 0,
      turnover: d.f107 ?? 0, // 成交额
      pe: d.f162 ? +(d.f162 / 100).toFixed(2) : null,
      pb: d.f167 ? +(d.f167 / 100).toFixed(2) : null,
      marketCap: d.f57 ?? 0,
      ts: Date.now(),
      source: "eastmoney"
    };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchFromCoinGecko(symbol) {
  const id = CRYPTO_IDS[symbol];
  if (!id) return null;
  const url = COINGECKO_URL.replace("{id}", id);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) return null;
    const j = await r.json();
    const d = j[id];
    if (!d) return null;
    const price = d.usd;
    const changePct = +(d.usd_24h_change ?? 0).toFixed(2);
    const change = +(price * (changePct / 100)).toFixed(2);
    return {
      symbol,
      name: symbol.toUpperCase() === "BTC" ? "比特币" : symbol,
      price,
      change,
      changePct,
      open: null,
      high: null,
      low: null,
      volume: 0,
      ts: Date.now(),
      source: "coingecko"
    };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchOne(symbol) {
  // 1. 内存缓存
  const cached = memCache.get(symbol);
  if (cached && Date.now() - cached.ts < TTL_LIVE_MS) {
    return { data: cached.data, source: "live", ts: cached.ts };
  }

  // 2. 真实 API
  let data = null;
  if (EAST_MONEY_SECID[symbol]) {
    data = await fetchFromEastMoney(symbol);
  } else if (CRYPTO_IDS[symbol]) {
    data = await fetchFromCoinGecko(symbol);
  }

  if (data) {
    memCache.set(symbol, { data, ts: Date.now() });
    return { data, source: "live", ts: Date.now() };
  }

  // 3. stale 缓存(过期但有值)
  if (cached) {
    return { data: cached.data, source: "stale", ts: cached.ts };
  }

  // 4. mock 兜底
  const mock = mockQuote(symbol);
  memCache.set(symbol, { data: mock, ts: Date.now() });
  return { data: mock, source: "mock", ts: Date.now() };
}

export async function fetchQuote(symbol) {
  return fetchOne(symbol);
}

export async function fetchQuotes(symbols) {
  const out = await Promise.all(symbols.map((s) => fetchOne(s)));
  return out; // [{data, source, ts}, ...]
}

// K 线(本期未实现,只占位返回空结构)
export async function fetchKline(symbol, period = "day", range = "3M") {
  return { symbol, period, range, candles: [], source: "mock", ts: Date.now() };
}
