// web/src/pages/InvestStrategyDetail.jsx
// 策略详情:理念 + 规则 + 当前命中 + 30 天历史回溯

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useToast } from "../components/ToastHost.jsx";
import { useStrategy, useStrategyHistory } from "../hooks/useQuote.js";
import StrategyHitsTable from "../components/invest/StrategyHitsTable.jsx";
import { PriceLine } from "../lib/chart.jsx";
import { useMemo } from "react";

function RulesList({ rules }) {
  if (!rules || rules.length === 0) return null;
  return (
    <ul className="strategy-rules">
      {rules.map((r, i) => {
        const opLabel = r.op === "lt" ? "<" : r.op === "gt" ? ">" : r.op === "in" ? "∈" : r.op;
        return (
          <li key={i} className="strategy-rules__item mono">
            <span className="strategy-rules__metric">{r.metric}</span>
            <span className="strategy-rules__op">{opLabel}</span>
            <span className="strategy-rules__value">
              {Array.isArray(r.value) ? r.value.join(" / ") : String(r.value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function HistoryCurve({ hits }) {
  // 按 signalDate 聚合成折线(取每天的 returnPct 平均)
  const series = useMemo(() => {
    if (!hits || hits.length === 0) return [];
    const byDate = new Map();
    for (const h of hits) {
      if (!byDate.has(h.signalDate)) byDate.set(h.signalDate, []);
      byDate.get(h.signalDate).push(h.returnPct || 0);
    }
    const dates = Array.from(byDate.keys()).sort();
    return dates.map((d) => {
      const arr = byDate.get(d);
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      return avg;
    });
  }, [hits]);

  if (series.length < 2) return null;
  return (
    <div className="strategy-history">
      <h4 className="strategy-history__title">30 天收益曲线(平均)</h4>
      <PriceLine values={series} height={140} />
    </div>
  );
}

export default function InvestStrategyDetail() {
  const { slug } = useParams();
  const toast = useToast();
  const { data: stratResp, loading: sLoading, error: sError } = useStrategy(slug);
  const { data: histResp, loading: hLoading } = useStrategyHistory(slug, 30);
  const [meta, setMeta] = useState(null);

  // 详情里的 strategy meta 不轮询(不变),用一次拉取
  useEffect(() => {
    if (stratResp) {
      setMeta({
        title: stratResp.title,
        subtitle: stratResp.subtitle,
        category: stratResp.category,
        philosophy: stratResp.philosophy,
        rules: stratResp.rules
      });
    }
  }, [stratResp]);

  const hits = stratResp?.hits || [];
  const history = histResp?.hits || [];

  if (sLoading && !stratResp) {
    return <div className="strategy-detail strategy-detail--loading">加载中…</div>;
  }
  if (sError) {
    return <div className="strategy-detail strategy-detail--error">策略加载失败:{sError}</div>;
  }
  if (!meta) {
    return <div className="strategy-detail">策略不存在</div>;
  }

  return (
    <article className="strategy-detail" aria-labelledby="strategy-title">
      <Link to="/invest/strategies" className="strategy-detail__back mono">← 返回策略库</Link>
      <header className="strategy-detail__head">
        <span className="strategy-detail__cat mono">{(meta.category || "").toUpperCase()}</span>
        <h2 className="strategy-detail__title" id="strategy-title">{meta.title}</h2>
        <p className="strategy-detail__sub">{meta.subtitle}</p>
      </header>
      <section className="strategy-detail__philosophy">
        <h3 className="section__title">策略理念</h3>
        <p>{meta.philosophy}</p>
      </section>
      <section className="strategy-detail__rules">
        <h3 className="section__title">筛选规则</h3>
        <RulesList rules={meta.rules} />
      </section>
      <section className="strategy-detail__current">
        <header className="invest-section__head">
          <h3 className="section__title">当前命中</h3>
          <span className="invest-section__hint mono">共 {hits.length} 只</span>
        </header>
        <StrategyHitsTable hits={hits} kind="current" />
      </section>
      <section className="strategy-detail__history">
        <header className="invest-section__head">
          <h3 className="section__title">历史回溯</h3>
          <span className="invest-section__hint mono">
            {hLoading ? "加载中…" : `共 ${history.length} 条 · 30 天`}
          </span>
        </header>
        <HistoryCurve hits={history} />
        <StrategyHitsTable hits={history.slice(0, 30)} kind="history" />
      </section>
    </article>
  );
}
