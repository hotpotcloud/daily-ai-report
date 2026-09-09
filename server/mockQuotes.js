// server/mockQuotes.js
// 离线 mock 行情数据生成器。
// 用于本地 dev(DNS 不可达时)和真实 API 失败的兜底。
// 所有 mock 数据基于固定 seed,保证页面刷新时数值稳定但有微小波动。

const MACRO_BASE = {
  // 8 个宏观标的的基准价(2024-2026 区间内合理估值)
  sh000001: { name: "上证指数", base: 3200, vol: 0.004, kind: "index" },
  sz399001: { name: "深证成指", base: 10500, vol: 0.005, kind: "index" },
  sz399006: { name: "创业板指", base: 2100, vol: 0.007, kind: "index" },
  hkHSI: { name: "恒生指数", base: 18500, vol: 0.006, kind: "index" },
  usIXIC: { name: "纳斯达克", base: 17800, vol: 0.005, kind: "index" },
  au2512: { name: "黄金期货", base: 2350, vol: 0.005, kind: "commodity" },
  cl2512: { name: "WTI 原油", base: 78, vol: 0.008, kind: "commodity" },
  btc: { name: "比特币", base: 65000, vol: 0.012, kind: "crypto" }
};

// A 股 mock 池(用于自选/策略命中展示)
const A_SHARE_POOL = [
  { symbol: "sh600519", name: "贵州茅台", base: 1620, pe: 28.5, pb: 9.2, divYield: 1.6, sector: "消费" },
  { symbol: "sh600036", name: "招商银行", base: 35.8, pe: 6.1, pb: 0.85, divYield: 5.8, sector: "金融" },
  { symbol: "sh601318", name: "中国平安", base: 48.2, pe: 8.9, pb: 0.92, divYield: 4.5, sector: "金融" },
  { symbol: "sz000858", name: "五粮液", base: 142, pe: 16.2, pb: 4.1, divYield: 2.8, sector: "消费" },
  { symbol: "sz000333", name: "美的集团", base: 72, pe: 13.8, pb: 2.6, divYield: 3.5, sector: "家电" },
  { symbol: "sh601398", name: "工商银行", base: 6.4, pe: 5.8, pb: 0.62, divYield: 6.1, sector: "金融" },
  { symbol: "sh600900", name: "长江电力", base: 28.5, pe: 18.2, pb: 3.1, divYield: 4.2, sector: "公用事业" },
  { symbol: "sh600028", name: "中国石化", base: 6.8, pe: 9.5, pb: 0.88, divYield: 5.5, sector: "能源" },
  { symbol: "sz000651", name: "格力电器", base: 42, pe: 8.2, pb: 1.85, divYield: 8.5, sector: "家电" },
  { symbol: "sh600887", name: "伊利股份", base: 26.5, pe: 14.5, pb: 2.9, divYield: 4.0, sector: "消费" },
  { symbol: "sh601088", name: "中国神华", base: 38, pe: 9.8, pb: 1.55, divYield: 5.8, sector: "能源" },
  { symbol: "sz002594", name: "比亚迪", base: 240, pe: 22.5, pb: 4.2, divYield: 0.5, sector: "汽车" },
  { symbol: "sh600276", name: "恒瑞医药", base: 48, pe: 38, pb: 4.5, divYield: 0.3, sector: "医药" },
  { symbol: "sz000063", name: "中兴通讯", base: 28, pe: 14.5, pb: 2.0, divYield: 1.2, sector: "通信" },
  { symbol: "sh601012", name: "隆基绿能", base: 18, pe: -15, pb: 1.8, divYield: 0, sector: "新能源" },
  { symbol: "sz300750", name: "宁德时代", base: 215, pe: 19.8, pb: 4.1, divYield: 0.8, sector: "新能源" },
  { symbol: "sh600050", name: "中国联通", base: 5.2, pe: 12, pb: 0.75, divYield: 3.2, sector: "通信" },
  { symbol: "sz000001", name: "平安银行", base: 11.5, pe: 5.2, pb: 0.55, divYield: 5.5, sector: "金融" },
  { symbol: "sh601800", name: "中国交建", base: 9.8, pe: 5.8, pb: 0.62, divYield: 3.8, sector: "基建" },
  { symbol: "sz002475", name: "立讯精密", base: 38, pe: 22, pb: 3.8, divYield: 0.5, sector: "电子" }
];

// 确定性"随机":基于 symbol + 当前小时,产出稳定但有波动的值
function seededRandom(symbol, salt) {
  let h = 0;
  const s = symbol + ":" + salt;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  // 映射到 [-0.5, 0.5]
  return ((h % 1000) / 1000) - 0.5;
}

function pickBase(symbol) {
  if (MACRO_BASE[symbol]) return MACRO_BASE[symbol];
  const a = A_SHARE_POOL.find((x) => x.symbol === symbol);
  if (a) return { name: a.name, base: a.base, vol: 0.012, kind: "stock" };
  // 未知 symbol:用 symbol hash 生成一个稳定价
  const h = symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return { name: symbol, base: 10 + (h % 90), vol: 0.012, kind: "stock" };
}

export function mockQuote(symbol) {
  const meta = pickBase(symbol);
  // 用"当前 5 分钟桶"作为 salt,5 分钟内数值稳定
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const drift = seededRandom(symbol, bucket) * meta.vol;
  const price = +(meta.base * (1 + drift)).toFixed(meta.kind === "crypto" ? 0 : 2);
  const prevClose = +(meta.base * (1 + seededRandom(symbol, bucket - 1) * meta.vol * 0.8)).toFixed(2);
  const change = +(price - prevClose).toFixed(2);
  const changePct = +((change / prevClose) * 100).toFixed(2);
  return {
    symbol,
    name: meta.name,
    price,
    change,
    changePct,
    open: +(prevClose * 1.002).toFixed(2),
    high: +(price * 1.008).toFixed(2),
    low: +(price * 0.992).toFixed(2),
    volume: Math.floor(1_000_000 + Math.abs(seededRandom(symbol, "vol")) * 50_000_000),
    ts: Date.now(),
    source: "mock",
    kind: meta.kind
  };
}

export function mockQuotes(symbols) {
  return symbols.map((s) => mockQuote(s));
}

// 暴露给策略层用的基础数据
export function getASharePool() {
  return A_SHARE_POOL.map((s) => ({
    ...s,
    // 给每只股票加一个伪"MA60"和"收盘价"
    close: s.base,
    ma60: +(s.base * (0.92 + Math.random() * 0.12)).toFixed(2),
    // 防御策略行业列表
    isDefensive: ["金融", "公用事业", "能源", "基建"].includes(s.sector)
  }));
}

export function getMacroUniverse() {
  return Object.entries(MACRO_BASE).map(([symbol, m]) => ({ symbol, name: m.name, kind: m.kind }));
}
