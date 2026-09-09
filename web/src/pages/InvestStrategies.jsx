// web/src/pages/InvestStrategies.jsx
// 策略库:3 套不同风格的预设策略

import { useEffect, useState } from "react";
import { api } from "../api.js";
import StrategyCard from "../components/invest/StrategyCard.jsx";
import { useToast } from "../components/ToastHost.jsx";

export default function InvestStrategies() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.strategies()
      .then((r) => { if (alive) setItems(r?.items || []); })
      .catch((e) => { if (alive) { setError(e.message); toast.push("策略加载失败:" + e.message, "error"); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [toast]);

  return (
    <div className="strategies-page">
      <p className="strategies-page__lede">
        3 套"不同风格"策略,从 A 股基础池里筛出当前命中。不接 ML,逻辑直接、规则透明、随时可校验。
      </p>
      {error && <p className="strategies-page__error">策略加载失败:{error}</p>}
      <div className="strategies-grid" role="list">
        {loading && items.length === 0
          ? <div className="strategies-grid__loading">加载中…</div>
          : items.map((s) => (
              <div role="listitem" key={s.slug}>
                <StrategyCard strategy={s} />
              </div>
            ))}
      </div>
      <footer className="strategies-page__disclaimer">
        <p>
          策略信号仅供参考,不构成投资建议。数据来自东方财富公开接口,日内 60s 缓存,过频调用可能触发限流。
        </p>
      </footer>
    </div>
  );
}
