// web/src/components/invest/MacroGrid.jsx
// 8 张宏观卡的网格

import MacroCard from "./MacroCard.jsx";

export default function MacroGrid({ items, loading, error, sparklineBySymbol }) {
  if (loading && (!items || items.length === 0)) {
    return <div className="macro-grid macro-grid--loading">加载中…</div>;
  }
  if (error && (!items || items.length === 0)) {
    return <div className="macro-grid macro-grid--error">网络异常,稍后重试</div>;
  }
  if (!items || items.length === 0) {
    return <div className="macro-grid macro-grid--empty">暂无数据</div>;
  }
  return (
    <div className="macro-grid" role="list">
      {items.map((it) => (
        <div role="listitem" key={it.symbol}>
          <MacroCard item={it} sparklineValues={sparklineBySymbol?.[it.symbol]} />
        </div>
      ))}
    </div>
  );
}
