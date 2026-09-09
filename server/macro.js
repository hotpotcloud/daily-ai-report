// server/macro.js
// 8 个宏观标的统一接口
// 5 指数 + 3 商品(黄金 / 原油 / 比特币)

import { fetchQuotes } from "./quotes.js";
import { getMacroUniverse } from "./mockQuotes.js";

export async function fetchIndices() {
  const universe = getMacroUniverse();
  const symbols = universe.map((u) => u.symbol);
  const results = await fetchQuotes(symbols);
  return results.map((r, i) => ({
    ...r.data,
    kind: universe[i].kind,
    source: r.source,
    fetchedAt: r.ts
  }));
}
