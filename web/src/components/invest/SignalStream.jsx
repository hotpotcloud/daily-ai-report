// web/src/components/invest/SignalStream.jsx
// 今日投资信号流:从日报衍生的多/空/关注

import { SIGNAL_TYPE_LABEL, SIGNAL_TYPE_BADGE } from "../../lib/investFormat.js";

export default function SignalStream({ items, loading, error }) {
  if (loading && (!items || items.length === 0)) {
    return <div className="signal-stream signal-stream--loading">加载中…</div>;
  }
  if (error && (!items || items.length === 0)) {
    return <div className="signal-stream signal-stream--error">信号获取失败</div>;
  }
  if (!items || items.length === 0) {
    return (
      <div className="signal-stream signal-stream--empty">
        暂无信号。日报生成后这里会显示从市场 / AI 板块衍生出的当日投资信号。
      </div>
    );
  }
  return (
    <ol className="signal-stream" aria-label="今日投资信号">
      {items.map((s) => (
        <li className={"signal-stream__item " + (SIGNAL_TYPE_BADGE[s.type] || "")} key={s.id}>
          <div className="signal-stream__head">
            <span className={"signal-stream__type " + (SIGNAL_TYPE_BADGE[s.type] || "")}>
              {SIGNAL_TYPE_LABEL[s.type] || "关注"}
            </span>
            <h4 className="signal-stream__title">{s.title}</h4>
          </div>
          {s.hint && <p className="signal-stream__hint">{s.hint}</p>}
          {s.relatedSymbols && s.relatedSymbols.length > 0 && (
            <div className="signal-stream__tags">
              {s.relatedSymbols.map((t, i) => (
                <span className="signal-stream__tag mono" key={i}>{t}</span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
