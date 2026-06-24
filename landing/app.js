// =============================================================
// Serenity Finance · Landing
// - 拉取最新 digest → 填充 hero preview / cap meter / marquee
// - IntersectionObserver reveal
// - 轻量 SVG preview chart
// =============================================================

const REFRESH_INTERVAL_MS = 60_000;

const refs = {
  heroDate: document.querySelector("#hero-date"),
  previewScore: document.querySelector("#preview-score"),
  previewTrend: document.querySelector("#preview-trend"),
  previewSentiment: document.querySelector("#preview-sentiment"),
  previewTime: document.querySelector("#preview-time"),
  previewChart: document.querySelector("#preview-chart"),
  previewAi: document.querySelector("#preview-ai"),
  capMeter: document.querySelector("#cap-meter"),
  capMeterFill: document.querySelector(".cap-meter__fill"),
  capSpark: document.querySelector("#cap-spark"),
  marqueeTrack: document.querySelector("#marquee-track")
};

const state = {
  latest: null,
  history: []
};

// =============================================================
// 启动
// =============================================================
async function bootstrap() {
  setupReveal();
  await loadAndRender();
  setInterval(loadAndRender, REFRESH_INTERVAL_MS);
}

// =============================================================
// Reveal
// =============================================================
function setupReveal() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const stagger = Number(entry.target.dataset.stagger || 0);
        entry.target.style.setProperty("--stagger", String(stagger));
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
}

// =============================================================
// 数据加载 + 渲染分发
// =============================================================
async function loadAndRender() {
  try {
    const [latestRes, historyRes] = await Promise.all([
      fetch("/api/digests/latest", { cache: "no-store" }),
      fetch("/api/digests?limit=8", { cache: "no-store" })
    ]);
    if (!latestRes.ok) throw new Error("latest failed");
    state.latest = await latestRes.json();
    state.history = historyRes.ok ? await historyRes.json() : [];
    renderAll();
  } catch (err) {
    // 静默：使用占位数据继续渲染
    paintPlaceholder();
  }
}

function renderAll() {
  paintHeroDate();
  paintPreview();
  paintCap();
  paintMarquee();
}

function paintPlaceholder() {
  if (refs.previewScore) refs.previewScore.textContent = "72";
  if (refs.previewTrend) refs.previewTrend.textContent = "+2.34%";
  if (refs.previewSentiment) refs.previewSentiment.textContent = "中性偏强";
  if (refs.previewTime) refs.previewTime.textContent = "刚刚";
  if (refs.previewAi) refs.previewAi.textContent = "+18%";
  if (refs.capMeter) refs.capMeter.textContent = "86";
  drawPreviewChart([60, 62, 65, 64, 68, 70, 72]);
  drawCapSpark([55, 58, 62, 60, 66, 70, 75, 78]);
  paintMarquee();
}

function paintHeroDate() {
  if (refs.heroDate) refs.heroDate.textContent = state.latest.digestDate || "—";
}

// =============================================================
// Hero preview
// =============================================================
function paintPreview() {
  const d = state.latest;
  const composite = computeComposite(d);
  const prevComposite = state.history[0] ? computeComposite(state.history[0]) : composite;
  const delta = composite - prevComposite;
  const deltaPct = prevComposite > 0 ? ((delta / prevComposite) * 100).toFixed(2) : "0.00";
  const sign = delta >= 0 ? "+" : "";

  if (refs.previewScore) refs.previewScore.textContent = String(composite);
  if (refs.previewTrend) {
    refs.previewTrend.textContent = `${sign}${deltaPct}%`;
    refs.previewTrend.classList.toggle("is-down", delta < 0);
  }
  if (refs.previewSentiment) refs.previewSentiment.textContent = d.marketSentiment || "—";
  if (refs.previewTime) refs.previewTime.textContent = formatRelative(d.updatedAt);

  // AI Pulse 数字
  if (refs.previewAi) {
    const metrics = d.metrics ?? [];
    const aiMetric = metrics.find((m) => /AI|ai|智|模型/i.test(m.label));
    refs.previewAi.textContent = aiMetric ? `+${Math.round(aiMetric.value - 50)}%` : "+18%";
  }

  // preview chart (历史 composite)
  const series = state.history
    .map((h) => computeComposite(h))
    .filter((v) => Number.isFinite(v))
    .reverse();
  series.push(composite);
  drawPreviewChart(series.length >= 2 ? series : [60, 65, 68, 72]);
}

function drawPreviewChart(values) {
  if (!refs.previewChart) return;
  const W = 480, H = 120, padX = 8, padY = 12;
  const innerW = W - padX * 2, innerH = H - padY * 2;
  const min = Math.min(...values), max = Math.max(...values);
  const xAt = (i) => padX + (innerW * i) / (values.length - 1);
  const yAt = (v) => padY + innerH - ((v - min) / (max - min || 1)) * innerH;

  let d = `M ${xAt(0).toFixed(1)} ${yAt(values[0]).toFixed(1)}`;
  for (let i = 1; i < values.length; i++) d += ` L ${xAt(i).toFixed(1)} ${yAt(values[i]).toFixed(1)}`;
  const area = `${d} L ${xAt(values.length - 1).toFixed(1)} ${(H - padY).toFixed(1)} L ${xAt(0).toFixed(1)} ${(H - padY).toFixed(1)} Z`;
  const lastX = xAt(values.length - 1).toFixed(1);
  const lastY = yAt(values[values.length - 1]).toFixed(1);

  refs.previewChart.innerHTML = `
    <defs>
      <linearGradient id="preview-stroke" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="hsl(160 84% 50%)"/>
        <stop offset="50%" stop-color="hsl(189 94% 55%)"/>
        <stop offset="100%" stop-color="hsl(262 83% 65%)"/>
      </linearGradient>
      <linearGradient id="preview-fill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="hsl(160 84% 50%)" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="hsl(160 84% 50%)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#preview-fill)"/>
    <path d="${d}" fill="none" stroke="url(#preview-stroke)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX}" cy="${lastY}" r="4" fill="hsl(160 84% 50%)"/>
    <circle cx="${lastX}" cy="${lastY}" r="8" fill="hsl(160 84% 50%)" opacity="0.2"/>
  `;
}

// =============================================================
// Capabilities
// =============================================================
function paintCap() {
  const d = state.latest;
  const composite = computeComposite(d);
  if (refs.capMeter) refs.capMeter.textContent = String(composite);
  if (refs.capMeterFill) refs.capMeterFill.style.setProperty("--p", `${composite}%`);

  // spark
  const series = state.history
    .map((h) => computeComposite(h))
    .filter((v) => Number.isFinite(v))
    .reverse();
  series.push(composite);
  drawCapSpark(series.length >= 2 ? series : [50, 55, 60, 58, 65, 70, 72]);
}

function drawCapSpark(values) {
  if (!refs.capSpark) return;
  const W = 280, H = 64, padX = 4, padY = 6;
  const innerW = W - padX * 2, innerH = H - padY * 2;
  const xAt = (i) => padX + (innerW * i) / (values.length - 1);
  const yAt = (v) => padY + innerH - (clamp(v) / 100) * innerH;

  let d = `M ${xAt(0).toFixed(1)} ${yAt(values[0]).toFixed(1)}`;
  for (let i = 1; i < values.length; i++) d += ` L ${xAt(i).toFixed(1)} ${yAt(values[i]).toFixed(1)}`;
  const area = `${d} L ${xAt(values.length - 1).toFixed(1)} ${(H - padY).toFixed(1)} L ${xAt(0).toFixed(1)} ${(H - padY).toFixed(1)} Z`;

  refs.capSpark.innerHTML = `
    <defs>
      <linearGradient id="cap-spark-fill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="hsl(160 84% 50%)" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="hsl(160 84% 50%)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#cap-spark-fill)"/>
    <path d="${d}" fill="none" stroke="hsl(160 84% 50%)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

// =============================================================
// Marquee
// =============================================================
function paintMarquee() {
  if (!refs.marqueeTrack) return;
  const items = buildMarqueeItems();
  refs.marqueeTrack.innerHTML = "";
  const frag = document.createDocumentFragment();
  // 复制 2 份以无缝
  for (let i = 0; i < 2; i++) items.forEach((it) => frag.appendChild(createMarqueeItem(it)));
  refs.marqueeTrack.appendChild(frag);
}

function buildMarqueeItems() {
  const out = [];
  const metrics = state.latest?.metrics ?? [];
  metrics.forEach((m) => {
    const series = collectMetricHistory(state.history)[m.label] || [];
    const prev = series.length >= 2 ? series[series.length - 2] : m.value;
    const diff = m.value - prev;
    out.push({ key: m.label, value: m.value, delta: Number.isFinite(diff) ? diff : 0 });
  });
  if (out.length === 0) {
    return [
      { key: "Composite", value: 72, delta: 2 },
      { key: "AI 热度", value: 68, delta: 5 },
      { key: "市场情绪", value: 58, delta: -3 },
      { key: "波动率", value: 45, delta: 1 }
    ];
  }
  return out;
}

function collectMetricHistory(history) {
  const map = {};
  (history || []).forEach((item) => {
    (item.metrics || []).forEach((m) => {
      if (!map[m.label]) map[m.label] = [];
      map[m.label].push(clamp(m.value));
    });
  });
  Object.keys(map).forEach((k) => map[k].reverse());
  return map;
}

function createMarqueeItem(item) {
  const el = document.createElement("span");
  el.className = "marquee__item";
  const dir = item.delta > 0 ? "is-up" : item.delta < 0 ? "is-down" : "";
  const arrow = item.delta > 0 ? "↑" : item.delta < 0 ? "↓" : "·";
  const sign = item.delta > 0 ? "+" : "";
  const txt = item.delta === 0 ? "0" : `${sign}${Math.round(item.delta)}`;
  el.innerHTML = `
    <span class="marquee__item-key">${escapeHtml(item.key)}</span>
    <span class="marquee__item-value">${escapeHtml(String(item.value))}</span>
    <span class="marquee__item-delta ${dir}">${arrow} ${escapeHtml(txt)}</span>
  `;
  return el;
}

// =============================================================
// 工具
// =============================================================
function computeComposite(d) {
  const metrics = Array.isArray(d.metrics) ? d.metrics : [];
  if (metrics.length) {
    return Math.round(metrics.reduce((s, m) => s + Number(m.value || 0), 0) / metrics.length);
  }
  const series = Array.isArray(d.chart?.series) ? d.chart.series : [];
  if (!series.length) return 0;
  return Math.round(series.reduce((s, v) => s + Number(v || 0), 0) / series.length);
}

function clamp(v) {
  return Math.max(0, Math.min(100, Number(v) || 0));
}

function formatRelative(value) {
  if (!value) return "—";
  const sec = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (sec < 60) return "刚刚";
  if (sec < 3600) return `${Math.round(sec / 60)} 分钟前`;
  if (sec < 86400) return `${Math.round(sec / 3600)} 小时前`;
  return `${Math.round(sec / 86400)} 天前`;
}

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// =============================================================
// Boot
// =============================================================
bootstrap();
