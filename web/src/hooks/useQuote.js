// web/src/hooks/useQuote.js
// 投资模块的轮询 hooks(行情/指数/信号)
// 设计原则:
//   - 默认 30s/60s 轮询,可在调用处覆盖
//   - 组件卸载自动停
//   - 网络错误保留上次值 + 标记 error
//   - visible 时跳过 tab 不可见时的轮询

import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api.js";

function usePolling(fetcher, intervalMs, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastTs, setLastTs] = useState(0);
  const timerRef = useRef(null);
  const aliveRef = useRef(true);

  const tick = useCallback(async () => {
    try {
      const r = await fetcher();
      if (!aliveRef.current) return;
      setData(r);
      setError(null);
      setLastTs(Date.now());
    } catch (e) {
      if (!aliveRef.current) return;
      setError(e?.message || "fetch failed");
    } finally {
      if (aliveRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    aliveRef.current = true;
    setLoading(true);
    tick();
    timerRef.current = setInterval(() => {
      if (document.hidden) return;
      tick();
    }, intervalMs);
    return () => {
      aliveRef.current = false;
      clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, lastTs, refresh: tick };
}

// 8 个宏观标的(指数 + 商品)
export function useIndices(intervalMs = 60000) {
  return usePolling(() => api.indices(), intervalMs, []);
}

// 单一标的
export function useQuote(symbol, intervalMs = 30000) {
  return usePolling(() => api.quote(symbol), intervalMs, [symbol]);
}

// 批量标的
export function useQuotes(symbols, intervalMs = 30000) {
  const key = symbols.slice().sort().join(",");
  return usePolling(() => api.quotes(symbols), intervalMs, [key]);
}

// 今日投资信号
export function useSignalsToday(intervalMs = 60000) {
  return usePolling(() => api.signalsToday(), intervalMs, []);
}

// 策略详情
export function useStrategy(slug) {
  return usePolling(() => api.strategy(slug), 0, [slug]);
}

// 策略历史
export function useStrategyHistory(slug, range = 30) {
  return usePolling(() => api.strategyHistory(slug, range), 0, [slug, range]);
}
