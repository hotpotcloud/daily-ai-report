// web/src/lib/chart.jsx
// 基于 Recharts 的轻量图表(用开源库,避免手写 SVG 的精度问题)
// 1. <Sparkline values=[…] />     迷你面积/折线
// 2. <PriceLine values=[…] />     净值/收益曲线

import { ResponsiveContainer, AreaChart, Area, LineChart, Line, YAxis, XAxis, Tooltip } from "recharts";

function pointsFromValues(values) {
  if (!values || values.length === 0) return [];
  return values.map((v, i) => ({ i, v: Number(v) || 0 }));
}

export function Sparkline({
  values,
  height = 32,
  width,
  color,
  fill = true,
  strokeWidth = 1.4,
  className = ""
}) {
  const data = pointsFromValues(values);
  if (data.length < 2) {
    return <div className={"sparkline-empty " + className} style={{ height }} />;
  }
  const positive = values[values.length - 1] >= values[0];
  const stroke = color || (positive ? "var(--up)" : "var(--down)");
  return (
    <div className={"sparkline " + className} style={{ height, width }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={`sg-grad-${positive ? "u" : "d"}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={fill ? 0.32 : 0} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={strokeWidth}
            fill={fill ? `url(#sg-grad-${positive ? "u" : "d"})` : "none"}
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriceLine({ values, height = 140, className = "", showAxis = false }) {
  const data = pointsFromValues(values);
  if (data.length < 2) {
    return <div className={"price-line price-line--empty " + className} style={{ height }}>暂无数据</div>;
  }
  const positive = values[values.length - 1] >= values[0];
  const color = positive ? "var(--up)" : "var(--down)";
  return (
    <div className={"price-line " + className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: showAxis ? 24 : 8 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          {showAxis && (
            <XAxis
              dataKey="i"
              tickFormatter={(i) => {
                const ratio = i / (data.length - 1);
                if (ratio <= 0.01) return values[0]?.toFixed(2);
                if (ratio >= 0.99) return values[values.length - 1]?.toFixed(2);
                if (Math.abs(ratio - 0.5) < 0.05) return values[Math.floor(data.length / 2)]?.toFixed(2);
                return "";
              }}
              tick={{ fontSize: 10, fill: "var(--fg-faint)" }}
              interval="preserveStartEnd"
              axisLine={false}
              tickLine={false}
            />
          )}
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.6}
            dot={false}
            activeDot={{ r: 3, fill: color }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
