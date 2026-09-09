// web/src/components/invest/MacroCard.jsx
// 宏观指标卡:名称 + 现价 + 涨跌 + sparkline

import { Sparkline } from "../../lib/chart.jsx";
import { formatPrice, formatPct, formatChange, classForChange } from "../../lib/investFormat.js";

export default function MacroCard({ item, sparklineValues }) {
  if (!item) return null;
  const cls = classForChange(item.changePct);
  return (
    <article className={"macro-card " + cls} aria-label={item.name}>
      <header className="macro-card__head">
        <span className="macro-card__name">{item.name}</span>
        <span className="macro-card__kind mono">{(item.kind || "").toUpperCase()}</span>
      </header>
      <div className="macro-card__price mono">
        {formatPrice(item.price, item.kind === "crypto" ? 0 : 2)}
      </div>
      <div className={"macro-card__change " + cls}>
        <span className="macro-card__num">{formatChange(item.change)}</span>
        <span className="macro-card__pct mono">{formatPct(item.changePct)}</span>
      </div>
      {sparklineValues && sparklineValues.length >= 2 && (
        <div className="macro-card__spark">
          <Sparkline values={sparklineValues} width={120} height={32} />
        </div>
      )}
    </article>
  );
}
