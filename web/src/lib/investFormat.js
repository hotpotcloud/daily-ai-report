// web/src/lib/investFormat.js
// 投资模块的格式化 helpers

export function formatPrice(price, decimals = 2) {
  if (price == null || isNaN(price)) return "—";
  if (price >= 10000) {
    return (price / 10000).toFixed(2) + " 万";
  }
  return Number(price).toFixed(decimals);
}

export function formatPct(pct, withSign = true) {
  if (pct == null || isNaN(pct)) return "—";
  const v = Number(pct);
  const s = v.toFixed(2) + "%";
  if (withSign && v > 0) return "+" + s;
  return s;
}

export function formatChange(change) {
  if (change == null || isNaN(change)) return "—";
  const v = Number(change);
  const s = Math.abs(v).toFixed(2);
  if (v > 0) return "+" + s;
  if (v < 0) return "−" + s;
  return s;
}

export function classForChange(pct) {
  if (pct == null || isNaN(pct)) return "";
  if (pct > 0) return "invest__up";
  if (pct < 0) return "invest__down";
  return "invest__flat";
}

export function formatVolume(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(2) + "万";
  return String(n);
}

export function formatRelativeTime(ts) {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() - ts) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
  if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
  return new Date(ts).toLocaleDateString("zh-CN");
}

export const SIGNAL_TYPE_LABEL = {
  bull: "看多",
  bear: "看空",
  info: "关注"
};

export const SIGNAL_TYPE_BADGE = {
  bull: "invest__signal--bull",
  bear: "invest__signal--bear",
  info: "invest__signal--info"
};
