// web/src/components/invest/IndexTicker.jsx
// 大盘指数条:横向滚动展示 5 个核心指数的实时报价

import { formatPct, formatChange, classForChange } from "../../lib/investFormat.js";

export default function IndexTicker({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="index-ticker" role="region" aria-label="大盘指数">
      <div className="index-ticker__rail">
        {items.map((it) => {
          const cls = classForChange(it.changePct);
          return (
            <div className={"index-ticker__item " + cls} key={it.symbol}>
              <span className="index-ticker__name">{it.name}</span>
              <span className="index-ticker__price mono">{it.price?.toFixed(2) || "—"}</span>
              <span className="index-ticker__chg mono">
                {formatChange(it.change)} {formatPct(it.changePct)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
