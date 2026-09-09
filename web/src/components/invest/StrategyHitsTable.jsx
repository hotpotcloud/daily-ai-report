// web/src/components/invest/StrategyHitsTable.jsx
// 命中表:展示当前命中标的或历史命中

import { formatPrice, formatPct, classForChange } from "../../lib/investFormat.js";

export default function StrategyHitsTable({ hits, kind = "current" }) {
  if (!hits || hits.length === 0) {
    return <div className="hits-table hits-table--empty">暂无数据</div>;
  }
  const isCurrent = kind === "current";
  return (
    <div className="hits-table" role="table">
      <div className="hits-table__head" role="row">
        <span role="columnheader">代码</span>
        <span role="columnheader">名称</span>
        {isCurrent && <span role="columnheader" className="num">行业</span>}
        <span role="columnheader" className="num">信号日</span>
        <span role="columnheader" className="num">{isCurrent ? "现价" : "信号价"}</span>
        {!isCurrent && <span role="columnheader" className="num">现价</span>}
        <span role="columnheader" className="num">浮动收益</span>
        {isCurrent && <span role="columnheader" className="num">来源</span>}
      </div>
      {hits.map((h) => {
        const cls = classForChange(h.returnPct);
        return (
          <div className={"hits-table__row " + cls} role="row" key={`${h.symbol}-${h.signalDate || "now"}`}>
            <span className="mono" role="cell">{h.symbol}</span>
            <span role="cell">{h.name || h.symbol}</span>
            {isCurrent && <span className="mono" role="cell">{h.sector || "—"}</span>}
            <span className="mono" role="cell">{h.signalDate || "—"}</span>
            <span className="num mono" role="cell">{formatPrice(isCurrent ? h.currentPrice : h.signalPrice)}</span>
            {!isCurrent && <span className="num mono" role="cell">{formatPrice(h.currentPrice)}</span>}
            <span className={"num mono " + cls} role="cell">{formatPct(h.returnPct)}</span>
            {isCurrent && <span className="num mono" role="cell">{h.source || "—"}</span>}
          </div>
        );
      })}
    </div>
  );
}
