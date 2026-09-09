// web/src/lib/chart.jsx
// 极简 SVG 图表,零依赖。
// 1. <Sparkline data=[…numbers] />     迷你折线(20×40,用于宏观卡)
// 2. <SparklineArea data=[…] />        填充版迷你面积图
// 3. <PriceLine data=[…numbers] />     净值曲线(响应式,带坐标)

import { useMemo } from "react";

function buildPath(values, w, h, pad = 1) {
  if (!values || values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  return values
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
    })
    .join(" ");
}

export function Sparkline({ values, width = 80, height = 28, color, fill = false, strokeWidth = 1.4, className = "" }) {
  if (!values || values.length < 2) return null;
  const d = buildPath(values, width, height);
  const positive = values[values.length - 1] >= values[0];
  const stroke = color || (positive ? "var(--up)" : "var(--down)");
  const id = useMemo(() => "sg-" + Math.random().toString(36).slice(2, 8), []);
  if (fill) {
    const areaPath = d + ` L ${(width - 1).toFixed(1)} ${(height - 1).toFixed(1)} L 1 ${(height - 1).toFixed(1)} Z`;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className={"sparkline " + className} aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${id})`} />
        <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={"sparkline " + className} aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 响应式净值曲线(用于策略历史回溯等)
export function PriceLine({ values, height = 120, stroke, fillBelow = true, className = "", showAxis = false }) {
  if (!values || values.length < 2) {
    return <div className="price-line price-line--empty" style={{ height }}>暂无数据</div>;
  }
  // 用 16:9 比例假设宽,实际由外层容器控制(viewBox 拉伸)
  const w = 600;
  const h = 200;
  const padX = 8;
  const padY = 12;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - padX * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = padX + i * step;
    const y = padY + (h - padY * 2) * (1 - (v - min) / range);
    return [x, y];
  });
  const d = points.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const areaD = d + ` L ${(w - padX).toFixed(1)} ${(h - padY).toFixed(1)} L ${padX} ${(h - padY).toFixed(1)} Z`;
  const positive = values[values.length - 1] >= values[0];
  const color = stroke || (positive ? "var(--up)" : "var(--down)");
  const id = "pl-" + Math.random().toString(36).slice(2, 8);

  // 选 4 个 y 轴标签
  const yLabels = [max, max - range / 3, max - (range * 2) / 3, min].map((v) => v.toFixed(2));

  return (
    <div className={"price-line " + className} style={{ height }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="price-line__svg" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {fillBelow && <path d={areaD} fill={`url(#${id})`} />}
        <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        {points.length > 0 && (
          <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2.5" fill={color} />
        )}
      </svg>
      {showAxis && (
        <div className="price-line__axis mono">
          <span>{values[0]?.toFixed(2)}</span>
          <span>{values[Math.floor(values.length / 2)]?.toFixed(2)}</span>
          <span>{values[values.length - 1]?.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
