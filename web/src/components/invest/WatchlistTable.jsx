// web/src/components/invest/WatchlistTable.jsx
// 自选股表:展示当前 watchlist 的实时行情

import { formatPct, formatChange, classForChange, formatPrice } from "../../lib/investFormat.js";

export default function WatchlistTable({ rows, onRemove, loading }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="watchlist-table watchlist-table--empty">
        <p>还没有自选股。在上方输入框加入 sh600519、sz000001 试试。</p>
      </div>
    );
  }
  return (
    <div className="watchlist-table" role="table" aria-label="自选股列表">
      <div className="watchlist-table__head" role="row">
        <span role="columnheader">代码</span>
        <span role="columnheader">名称</span>
        <span role="columnheader" className="num">现价</span>
        <span role="columnheader" className="num">涨跌</span>
        <span role="columnheader" className="num">涨跌幅</span>
        <span role="columnheader" className="num">来源</span>
        <span role="columnheader" aria-label="操作"></span>
      </div>
      {rows.map((r) => {
        const cls = classForChange(r.changePct);
        return (
          <div className={"watchlist-table__row " + cls} role="row" key={r.symbol}>
            <span className="watchlist-table__sym mono" role="cell">{r.symbol}</span>
            <span role="cell">{r.name || r.symbol}</span>
            <span className="num mono" role="cell">{formatPrice(r.price)}</span>
            <span className={"num mono " + cls} role="cell">{formatChange(r.change)}</span>
            <span className={"num mono " + cls} role="cell">{formatPct(r.changePct)}</span>
            <span className="num mono watchlist-table__src" role="cell">{r.source || "—"}</span>
            <span role="cell">
              <button
                type="button"
                className="watchlist-table__remove"
                onClick={() => onRemove?.(r.symbol)}
                aria-label={`移除 ${r.name || r.symbol}`}
              >×</button>
            </span>
          </div>
        );
      })}
      {loading && <div className="watchlist-table__loading mono">刷新中…</div>}
    </div>
  );
}
