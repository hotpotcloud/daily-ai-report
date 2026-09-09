// web/src/pages/InvestDashboard.jsx
// 投资看板:宏观卡 + 指数条 + 自选 + 信号流
// 自选股走 localStorage(本期),二期切服务端

import { useEffect, useMemo, useState } from "react";
import { useToast } from "../components/ToastHost.jsx";
import { useIndices, useQuotes, useSignalsToday } from "../hooks/useQuote.js";
import MacroGrid from "../components/invest/MacroGrid.jsx";
import IndexTicker from "../components/invest/IndexTicker.jsx";
import WatchlistEditor from "../components/invest/WatchlistEditor.jsx";
import WatchlistTable from "../components/invest/WatchlistTable.jsx";
import SignalStream from "../components/invest/SignalStream.jsx";
import { formatRelativeTime } from "../lib/investFormat.js";

const STORAGE_KEY = "signalboard:watchlist:v1";
const DEFAULT_WATCHLIST = ["sh000001", "sz399006", "sh600519", "sh600036"];

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string");
    }
  } catch (_) {}
  return DEFAULT_WATCHLIST.slice();
}

function saveWatchlist(arr) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch (_) {}
}

export default function InvestDashboard() {
  const [watchlist, setWatchlist] = useState(loadWatchlist);
  const toast = useToast();

  useEffect(() => { saveWatchlist(watchlist); }, [watchlist]);

  const { data: indicesResp, loading: idxLoading, error: idxError, lastTs: idxTs } = useIndices(60000);
  const { data: quotesResp, loading: qLoading } = useQuotes(watchlist, 30000);
  const { data: signalsResp, loading: sigLoading, error: sigError, lastTs: sigTs } = useSignalsToday(60000);

  const indices = indicesResp?.items || [];
  const ticker = useMemo(() => indices.filter((x) => x.kind === "index").slice(0, 5), [indices]);
  const watchRows = quotesResp?.items || [];
  const signals = signalsResp?.items || [];

  // 给宏观卡伪 sparkline(基于今日 changePct 衍生 8 个数据点)
  const sparklineBySymbol = useMemo(() => {
    const out = {};
    for (const it of indices) {
      const base = it.price || 100;
      const change = it.changePct || 0;
      const steps = 8;
      out[it.symbol] = Array.from({ length: steps }, (_, i) => {
        const t = i / (steps - 1);
        // 模拟一天的价格曲线:线性从昨收到今价
        return base * (1 - (change / 100) * (1 - t));
      });
    }
    return out;
  }, [indices]);

  const addStock = (sym) => {
    if (watchlist.includes(sym)) {
      toast.push(sym + " 已在自选里", "info");
      return;
    }
    if (watchlist.length >= 30) {
      toast.push("自选最多 30 只", "error");
      return;
    }
    setWatchlist((prev) => [...prev, sym]);
    toast.push("已加入自选:" + sym, "success");
  };

  const removeStock = (sym) => {
    setWatchlist((prev) => prev.filter((x) => x !== sym));
    toast.push("已移除 " + sym, "info");
  };

  return (
    <>
      <section className="invest-section" aria-labelledby="indices-title">
        <header className="invest-section__head">
          <h2 className="section__title" id="indices-title">今日宏观</h2>
          <span className="invest-section__hint mono">
            {idxError ? "网络异常,使用缓存/兜底" : `实时 · ${formatRelativeTime(idxTs)}`}
          </span>
        </header>
        <MacroGrid items={indices} loading={idxLoading} error={idxError} sparklineBySymbol={sparklineBySymbol} />
      </section>

      <section className="invest-section" aria-labelledby="ticker-title">
        <h2 className="section__title" id="ticker-title">大盘速览</h2>
        <IndexTicker items={ticker} />
      </section>

      <section className="invest-section" aria-labelledby="watchlist-title">
        <header className="invest-section__head">
          <h2 className="section__title" id="watchlist-title">自选股</h2>
          <span className="invest-section__hint mono">
            共 {watchlist.length} 只 · localStorage 暂存
          </span>
        </header>
        <WatchlistEditor onAdd={addStock} />
        <WatchlistTable rows={watchRows} onRemove={removeStock} loading={qLoading} />
      </section>

      <section className="invest-section" aria-labelledby="signals-title">
        <header className="invest-section__head">
          <h2 className="section__title" id="signals-title">今日投资信号</h2>
          <span className="invest-section__hint mono">
            {sigError ? "网络异常" : `基于日报衍生 · ${formatRelativeTime(sigTs)}`}
          </span>
        </header>
        <SignalStream items={signals} loading={sigLoading} error={sigError} />
      </section>
    </>
  );
}
