// web/src/components/invest/StrategyCard.jsx
// 策略卡(列表用)

import { Link } from "react-router-dom";

export default function StrategyCard({ strategy }) {
  if (!strategy) return null;
  return (
    <Link to={`/invest/strategies/${strategy.slug}`} className="strategy-card" aria-label={strategy.title}>
      <header className="strategy-card__head">
        <span className="strategy-card__cat mono">{strategy.category?.toUpperCase()}</span>
        <span className="strategy-card__count mono">命中 {strategy.hitCount} 只</span>
      </header>
      <h3 className="strategy-card__title">{strategy.title}</h3>
      <p className="strategy-card__sub">{strategy.subtitle}</p>
      <span className="strategy-card__cta mono">查看策略 →</span>
    </Link>
  );
}
