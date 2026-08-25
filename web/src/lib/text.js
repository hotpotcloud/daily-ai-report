// 通用 helpers
export const pad2 = (n) => String(n).padStart(2, "0");
export const formatDateCN = (d) => `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
export const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, (Date.now() - t) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
  if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
  return new Date(iso).toLocaleDateString("zh-CN");
}

export function shortSource(url, sourceName) {
  if (sourceName) return sourceName;
  if (!url) return "资讯";
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host.includes("36kr")) return "36 氪";
    if (host.includes("leiphone")) return "雷锋网";
    if (host.includes("ithome")) return "IT 之家";
    if (host.includes("wallstreetcn")) return "华尔街见闻";
    if (host.includes("sina")) return "新浪财经";
    if (host.includes("cnbc")) return "CNBC";
    if (host.includes("solidot")) return "Solidot";
    return host.split(".")[0];
  } catch (_) { return "资讯"; }
}

export function estimateReadMinutes(text) {
  if (!text) return 4;
  const chars = (text.match(/[一-鿿]/g) || []).length;
  return Math.max(2, Math.min(15, Math.round(chars / 300) || 4));
}

export function inferTags(text) {
  if (!text) return ["ai"];
  const t = text.toLowerCase();
  const tags = [];
  if (/(制裁|出口|许可|实体清单|监管|政策|国务院|发改委)/.test(t)) tags.push("policy");
  if (/(阿里|腾讯|字节|百度|华为|英伟达|nvidia|台积电|tsmc|三星|谷歌|微软|亚马逊|aws|azure|公司)/.test(t)) tags.push("company");
  if (/(a 股|港股|美股|创业板|科创|恒生|纳斯达克|标普|道琼斯|涨|跌|市值|融资|配售|ipo|财报|业绩)/.test(t)) tags.push("market");
  if (/(ai|大模型|llm|gpt|hbm|算力|训练|推理|智能体|nlp)/.test(t)) tags.push("ai");
  if (/(芯片|半导体|台积|smic|寒武纪|长鑫|存储|nand|dram|代工|晶圆)/.test(t)) tags.push("tech");
  return tags.length ? tags.slice(0, 2) : ["tech"];
}

export const TAG_LABEL = {
  policy: { text: "政策", cls: "pick__tag--policy briefing__tag--policy" },
  company: { text: "公司", cls: "pick__tag--company briefing__tag--company" },
  market: { text: "市场", cls: "pick__tag--market briefing__tag--market" },
  ai: { text: "AI", cls: "pick__tag--ai briefing__tag--ai" },
  tech: { text: "科技", cls: "pick__tag--tech briefing__tag--tech" }
};

export function inferHashTags(text, max = 3) {
  if (!text) return [];
  const dict = [
    ["英伟达", "英伟达"], ["nvidia", "英伟达"], ["hbm", "HBM"], ["h20", "H20"],
    ["阿里", "阿里云"], ["华为", "华为"], ["寒武纪", "寒武纪"], ["长鑫", "长鑫存储"],
    ["出口", "出口管制"], ["管制", "出口管制"], ["制裁", "制裁"],
    ["算力", "算力"], ["芯片", "芯片"], ["绿电", "绿电"], ["新能源", "新能源"],
    ["资本开支", "资本开支"]
  ];
  const hits = [];
  for (const [k, label] of dict) {
    if (text.includes(k) && !hits.find((h) => h.label === label)) hits.push({ k, label });
    if (hits.length >= max) break;
  }
  return hits;
}

export function makeSub(desc) {
  if (!desc) return "";
  const cleaned = desc.replace(/<[^>]+>/g, "").trim();
  const m = cleaned.split(/[。!?]/);
  return (m[0] || cleaned).slice(0, 60).trim();
}

export function newsId(item) {
  try { return (item.link || "").split("/").filter(Boolean).slice(-2).join("/") || (item.title || "").slice(0, 30); }
  catch (_) { return (item.title || "").slice(0, 30); }
}
