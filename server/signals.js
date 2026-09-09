// server/signals.js
// 从最新日报的 marketItems / aiItems 衍生"今日投资信号"
// 不做 ML,只是把日报里出现的关键词(代码/公司名)抽出来,生成 1-2 句解读

import { getLatestDigest } from "./db.js";

// 简易公司/代码识别(挑出日报里出现的 A 股代码 + 几个常出现的关键词)
const CODE_RE = /\b[036]\d{5}\b|\bSH\d{6}\b|\bSZ\d{6}\b/g;
const KEY_COMPANIES = [
  { kw: "英伟达", tag: "NVDA · 算力" },
  { kw: "寒武纪", tag: "688256 · 国产 AI 芯片" },
  { kw: "海光", tag: "688041 · 国产 CPU" },
  { kw: "中芯", tag: "0981.HK / 688981 · 晶圆代工" },
  { kw: "台积", tag: "TSM · 晶圆代工龙头" },
  { kw: "比亚迪", tag: "002594 · 新能源车" },
  { kw: "宁德", tag: "300750 · 动力电池" },
  { kw: "茅台", tag: "600519 · 消费龙头" },
  { kw: "阿里", tag: "BABA · 互联网" },
  { kw: "腾讯", tag: "0700.HK · 互联网" },
  { kw: "半导体", tag: "板块 · 半导体景气" },
  { kw: "HBM", tag: "存储 · 高带宽内存" },
  { kw: "机器人", tag: "板块 · 具身智能" }
];

function extractSymbols(text) {
  if (!text) return [];
  const codes = (text.match(CODE_RE) || []).map((c) => c.toUpperCase());
  const tags = KEY_COMPANIES.filter((k) => text.includes(k.kw)).map((k) => k.tag);
  return Array.from(new Set([...codes, ...tags])).slice(0, 6);
}

function pickType(text) {
  if (!text) return "info";
  if (/涨|新高|突破|利好|超预期|走强/.test(text)) return "bull";
  if (/跌|回调|承压|不及预期|走弱|风险/.test(text)) return "bear";
  return "info";
}

export function deriveFromDigest(digest) {
  if (!digest) return [];
  const out = [];
  const sourceItems = [
    ...(Array.isArray(digest.marketItems) ? digest.marketItems : []),
    ...(Array.isArray(digest.aiItems) ? digest.aiItems : [])
  ];
  sourceItems.slice(0, 6).forEach((seg, i) => {
    const text = typeof seg === "string" ? seg : seg?.content || "";
    const title = typeof seg === "string" ? "" : seg?.title || "";
    if (!text) return;
    out.push({
      id: `sig-${digest.digestDate || "today"}-${i}`,
      type: pickType(text),
      title: title || text.split(/[,,,;;。]/)[0].slice(0, 24) || "今日信号",
      hint: text.slice(0, 120),
      relatedSymbols: extractSymbols(text)
    });
  });
  return out;
}

export function todaySignals() {
  return deriveFromDigest(getLatestDigest());
}
