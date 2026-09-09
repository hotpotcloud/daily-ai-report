// API 客户端:统一 fetch,带 cookie
async function jget(url) {
  const r = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!r.ok) {
    let msg = "HTTP " + r.status;
    try { const j = await r.json(); if (j?.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}
async function jpost(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) {
    let msg = "HTTP " + r.status;
    try { const j = await r.json(); if (j?.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}
async function jdel(url, body) {
  const r = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) {
    let msg = "HTTP " + r.status;
    try { const j = await r.json(); if (j?.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

export const api = {
  health: () => jget("/api/health"),
  news: () => jget("/api/news"),
  digest: () => jget("/api/digest/latest"),
  archive: () => jget("/api/archive"),
  topics: () => jget("/api/topics"),
  topic: (slug) => jget(`/api/topics/${slug}`),
  category: (slug) => jget(`/api/category/${slug}`),
  authMe: () => jget("/api/auth/me"),
  me: () => jget("/api/me"),
  collectionsList: () => jget("/api/me/collections"),
  collectionsAdd: (item) => jpost("/api/me/collections", { item }),
  collectionsRemove: (id) => jdel("/api/me/collections", { item: { id } }),
  followList: () => jget("/api/me/follow"),
  followAdd: (topic) => jpost("/api/me/follow", { topic }),
  followRemove: (topic) => jdel("/api/me/follow", { topic }),

  // ─── 投资模块(invest v0.3)───────────────────
  indices: () => jget("/api/indices"),
  quote: (symbol) => jget(`/api/quote?symbol=${encodeURIComponent(symbol)}`),
  quotes: (symbols) => {
    if (!symbols || symbols.length === 0) return Promise.resolve({ items: [], ts: 0 });
    return jget(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
  },
  sparks: (symbols, days = 30) => {
    if (!symbols || symbols.length === 0) return Promise.resolve({ items: {}, days, ts: 0 });
    return jget(`/api/sparks?symbols=${encodeURIComponent(symbols.join(","))}&days=${days}`);
  },
  kline: (symbol, period = "day", range = "3M") =>
    jget(`/api/kline?symbol=${encodeURIComponent(symbol)}&period=${period}&range=${range}`),
  strategies: () => jget("/api/strategies"),
  strategy: (slug) => jget(`/api/strategies/${slug}`),
  strategyHistory: (slug, range = 30) =>
    jget(`/api/strategies/${slug}/history?range=${range}`),
  signalsToday: () => jget("/api/signals/today")
};

export async function chatStream(messages, onDelta) {
  const r = await fetch("/api/chat?stream=true", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    credentials: "include",
    body: JSON.stringify({ messages })
  });
  if (!r.ok || !r.body) {
    let msg = "HTTP " + r.status;
    try { const j = await r.json(); if (j?.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let p;
        try { p = JSON.parse(data); } catch (_) { continue; }
        if (p.error) throw new Error(p.error);
        if (typeof p.delta === "string") onDelta(p.delta);
      }
    }
  }
}
