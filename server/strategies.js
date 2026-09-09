// server/strategies.js
// 3 套"不同风格"策略的硬编码定义 + 命中计算 + 历史回溯

import { db } from "./db.js";
import { getASharePool } from "./mockQuotes.js";
import { fetchQuotes } from "./quotes.js";

export const STRATEGY_DEFS = [
  {
    slug: "value",
    title: "价值低估值",
    subtitle: "PE<20 + PB<3 + 股息率>2%",
    category: "value",
    philosophy:
      "买入被市场低估的成熟公司。逻辑:盈利稳定、资产扎实、股息有保障,适合长期持有等待估值修复。本期筛选沪深 300 范围内的金融/消费/能源龙头,用 PE / PB / 股息率三重过滤掉题材股。",
    rules: [
      { metric: "pe", op: "lt", value: 20 },
      { metric: "pb", op: "lt", value: 3 },
      { metric: "divYield", op: "gt", value: 2 }
    ]
  },
  {
    slug: "trend",
    title: "趋势多头",
    subtitle: "收盘价站上 60 日均线",
    category: "trend",
    philosophy:
      "顺势而为。股价站上 60 日均线说明中期趋势向上,继续持有概率大于回调。本期样本是 A 股中市值较大、流动性较好的标的,均线参数固定 60 日。",
    rules: [{ metric: "closeVsMa60", op: "gt", value: 0 }]
  },
  {
    slug: "defensive",
    title: "防御配置",
    subtitle: "公用事业 + 高股息(>4%)",
    category: "defensive",
    philosophy:
      "市场不好时抗跌。逻辑:水电燃气、银行、能源、基建这些行业受经济周期影响小,股息率普遍 4% 以上,下跌空间有限、底部有票息保护。",
    rules: [
      { metric: "sector", op: "in", value: ["金融", "公用事业", "能源", "基建"] },
      { metric: "divYield", op: "gt", value: 4 }
    ]
  }
];

// 启动时 seed 3 套策略到 DB(幂等)
export function ensureStrategySeeded() {
  const stmt = db.prepare(`
    INSERT INTO strategies (slug, title, subtitle, category, philosophy, rules, created_at)
    VALUES (@slug, @title, @subtitle, @category, @philosophy, @rules, @created_at)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      subtitle = excluded.subtitle,
      category = excluded.category,
      philosophy = excluded.philosophy,
      rules = excluded.rules
  `);
  const now = Date.now();
  for (const s of STRATEGY_DEFS) {
    stmt.run({
      slug: s.slug,
      title: s.title,
      subtitle: s.subtitle,
      category: s.category,
      philosophy: s.philosophy,
      rules: JSON.stringify(s.rules),
      created_at: now
    });
  }
}

// 根据 rule 评估一只股票
function evaluate(stock, rules) {
  for (const r of rules) {
    const v = stock[r.metric];
    if (v === undefined || v === null) return false;
    if (r.op === "lt" && !(v < r.value)) return false;
    if (r.op === "gt" && !(v > r.value)) return false;
    if (r.op === "in" && !r.value.includes(v)) return false;
  }
  return true;
}

function hitsForStrategy(slug) {
  const def = STRATEGY_DEFS.find((s) => s.slug === slug);
  if (!def) return [];
  const pool = getASharePool();
  return pool.filter((s) => evaluate(s, def.rules));
}

// 当前命中(用真实/兜底行情填充价格)
export async function computeHits(slug) {
  const def = STRATEGY_DEFS.find((s) => s.slug === slug);
  if (!def) return [];
  const matched = hitsForStrategy(slug);
  if (matched.length === 0) return [];
  const symbols = matched.map((m) => m.symbol);
  const quotes = await fetchQuotes(symbols);
  const today = new Date().toISOString().slice(0, 10);
  return matched.map((m, i) => {
    const q = quotes[i]?.data || {};
    return {
      symbol: m.symbol,
      name: m.name,
      sector: m.sector,
      pe: m.pe,
      pb: m.pb,
      divYield: m.divYield,
      signalDate: today,
      signalPrice: q.price ?? m.base,
      currentPrice: q.price ?? m.base,
      returnPct: q.changePct ?? 0,
      source: quotes[i]?.source ?? "mock"
    };
  });
}

// 历史回溯(用"伪时间序列":过去 30 天里给每只命中股一个示意价格)
export async function historyHits(slug, rangeDays = 30) {
  const matched = hitsForStrategy(slug);
  if (matched.length === 0) return [];
  const quotes = await fetchQuotes(matched.map((m) => m.symbol));
  const out = [];
  const now = Date.now();
  for (let d = rangeDays; d >= 1; d--) {
    const date = new Date(now - d * 24 * 3600 * 1000).toISOString().slice(0, 10);
    matched.forEach((m, i) => {
      const q = quotes[i]?.data || {};
      const currentPrice = q.price ?? m.base;
      // 伪历史价格:基于"今天的 changePct"反推一个"30 天前"的合理价位
      const signalPrice = +(currentPrice * (1 - (q.changePct ?? 0) / 100 * (d / 30))).toFixed(2);
      out.push({
        symbol: m.symbol,
        name: m.name,
        signalDate: date,
        signalPrice,
        currentPrice: +currentPrice.toFixed(2),
        returnPct: currentPrice > 0 ? +(((currentPrice - signalPrice) / signalPrice) * 100).toFixed(2) : 0
      });
    });
  }
  return out.sort((a, b) => (a.signalDate < b.signalDate ? 1 : -1));
}

// 列表 API:带命中数(命中数是动态估算,基于 pool 静态)
export function listStrategies() {
  return STRATEGY_DEFS.map((s) => ({
    slug: s.slug,
    title: s.title,
    subtitle: s.subtitle,
    category: s.category,
    hitCount: hitsForStrategy(s.slug).length
  }));
}

export function getStrategy(slug) {
  return STRATEGY_DEFS.find((s) => s.slug === slug) || null;
}
