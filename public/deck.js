// =============================================================
// Signal Board · 重构版 (Command Deck v2)
// - editorial composite dial
// - 6-day horizon (stacked area)
// - 4-card metrics rail
// - focus constellation (SVG nodes + lines)
// - cadence chart with annotations
// - polling + reveal + magnetic shells
// =============================================================

const REFRESH_INTERVAL_MS = 60_000;
const STALE_THRESHOLD_MS = 5 * 60_000;
const TICKER_DUPLICATE = 2;
const SVG_NS = "http://www.w3.org/2000/svg";

const refs = {
  heroDate: document.querySelector("#hero-date"),
  chipDate: document.querySelector("#chip-date .mono"),
  chipUpdated: document.querySelector("#chip-updated .mono"),
  topbarDate: document.querySelector("#topbar-date"),
  statusPill: document.querySelector("#status-pill"),
  statusRelative: document.querySelector("#status-relative"),
  staleFlag: document.querySelector(".stale-flag"),
  compositeScore: document.querySelector("#composite-score"),
  dialRing: document.querySelector("#dial-ring"),
  dialTrend: document.querySelector("#dial-trend"),
  summary: document.querySelector("#summary"),
  marketSentiment: document.querySelector("#market-sentiment"),
  aiSentiment: document.querySelector("#ai-sentiment"),
  marketDelta: document.querySelector("#market-delta"),
  aiDelta: document.querySelector("#ai-delta"),
  marketSpark: document.querySelector("#market-spark"),
  aiSpark: document.querySelector("#ai-spark"),
  horizonChart: document.querySelector("#horizon-chart"),
  metricsRail: document.querySelector("#metrics-rail"),
  constellation: document.querySelector("#constellation"),
  narrative: document.querySelector("#narrative"),
  cadenceChart: document.querySelector("#cadence-chart"),
  cadenceStats: document.querySelector("#cadence-stats"),
  tickerTrack: document.querySelector("#ticker-track")
};

const state = {
  latest: null,
  history: [],
  lastUpdatedAt: null
};

// =============================================================
// 启动
// =============================================================
async function bootstrap() {
  setupReveal();
  paintTopbarDate();
  await load({ silent: false });
  startPolling();
  startRelativeTicker();
}

// =============================================================
// Reveal (IntersectionObserver)
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
// 时间 / 状态
// =============================================================
function paintTopbarDate() {
  if (!refs.topbarDate) return;
  const fmt = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
  refs.topbarDate.textContent = fmt.format(new Date());
}

function startRelativeTicker() {
  const update = () => {
    if (state.lastUpdatedAt) {
      const text = relativeTime(state.lastUpdatedAt);
      if (refs.statusRelative) refs.statusRelative.textContent = text;
      paintStatus();
    }
  };
  update();
  setInterval(update, 30_000);
}

function paintStatus() {
  if (!refs.statusPill || !state.lastUpdatedAt) return;
  const age = Date.now() - state.lastUpdatedAt.getTime();
  refs.statusPill.classList.toggle("is-stale", age > STALE_THRESHOLD_MS);
  refs.statusPill.classList.toggle("is-live", age <= STALE_THRESHOLD_MS);
}

function relativeTime(date) {
  const sec = Math.round((Date.now() - date.getTime()) / 1000);
  if (sec < 5) return "刚刚更新";
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return `${Math.round(hr / 24)} 天前`;
}

// =============================================================
// 轮询
// =============================================================
function startPolling() {
  setInterval(() => {
    if (document.visibilityState === "visible") load({ silent: true });
  }, REFRESH_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") load({ silent: true });
  });
}

// =============================================================
// 数据加载
// =============================================================
async function load({ silent } = { silent: false }) {
  try {
    const [latestRes, historyRes] = await Promise.all([
      fetch("/api/digests/latest", { cache: "no-store" }),
      fetch("/api/digests?limit=6", { cache: "no-store" })
    ]);
    if (!latestRes.ok) throw new Error("latest failed");
    const latest = await latestRes.json();
    const history = historyRes.ok ? await historyRes.json() : [];

    state.latest = latest;
    state.history = history;
    state.lastUpdatedAt = new Date(latest.updatedAt ?? Date.now());

    renderAll();
    document.body.classList.remove("is-stale");
  } catch (err) {
    if (!silent) renderEmpty();
    document.body.classList.add("is-stale");
  }
}

function renderEmpty() {
  if (refs.summary) refs.summary.textContent = "暂无数据，请先执行初始化和导入脚本。";
  if (refs.marketSentiment) refs.marketSentiment.textContent = "—";
  if (refs.aiSentiment) refs.aiSentiment.textContent = "—";
  if (refs.compositeScore) refs.compositeScore.textContent = "--";
}

// =============================================================
// 渲染分发
// =============================================================
function renderAll() {
  const { latest, history } = state;
  if (!latest) return;

  const composite = computeComposite(latest);
  const marketSeries = extractSeries(history, latest, "market");
  const aiSeries = extractSeries(history, latest, "ai");

  renderHeroMeta(latest);
  renderDial(composite);
  renderSignals(latest, marketSeries, aiSeries);
  renderHorizon(history, latest);
  renderMetrics(history, latest);
  renderConstellation(latest);
  renderNarrative(latest);
  renderCadence(history, latest);
  renderTicker(latest, history);
}

// =============================================================
// Composite 工具
// =============================================================
function computeComposite(digest) {
  const metrics = Array.isArray(digest.metrics) ? digest.metrics : [];
  if (metrics.length) {
    return Math.round(metrics.reduce((s, m) => s + Number(m.value || 0), 0) / metrics.length);
  }
  const series = Array.isArray(digest.chart?.series) ? digest.chart.series : [];
  if (!series.length) return 0;
  return Math.round(series.reduce((s, v) => s + Number(v || 0), 0) / series.length);
}

function extractSeries(history, latest, kind) {
  // kind: market | ai
  const items = kind === "market" ? (latest.marketItems ?? []) : (latest.aiItems ?? []);
  // 用 6 天历史的 composite 趋势作为示意（真实数据可换成对应序列）
  return history
    .map((h) => computeComposite(h))
    .filter((v) => Number.isFinite(v))
    .reverse();
}

// =============================================================
// Hero meta
// =============================================================
function renderHeroMeta(digest) {
  if (refs.heroDate) refs.heroDate.textContent = digest.digestDate || "—";
  if (refs.chipDate) refs.chipDate.textContent = digest.digestDate || "—";
  if (refs.chipUpdated) refs.chipUpdated.textContent = formatDateTime(digest.updatedAt);
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

// =============================================================
// Dial (composite ring)
// =============================================================
function renderDial(score) {
  if (!refs.dialRing) return;
  const deg = Math.round((clamp(score) / 100) * 360);
  refs.dialRing.style.background = `conic-gradient(
    hsl(160 70% 42%) 0deg,
    hsl(189 80% 50%) ${Math.max(deg - 40, 0)}deg,
    hsl(262 70% 60%) ${deg}deg,
    hsla(0 0% 100% / 0.06) ${deg}deg
  )`;

  if (refs.dialTrend) {
    const label = scoreLabel(score);
    refs.dialTrend.textContent = label;
    refs.dialTrend.style.color =
      score >= 65 ? "hsl(160 70% 50%)" :
      score >= 45 ? "hsl(189 80% 55%)" :
                    "hsl(0 72% 60%)";
  }

  if (refs.summary) refs.summary.textContent = state.latest.summary || "暂无数据";

  animateNumber(refs.compositeScore, score);
}

function scoreLabel(score) {
  if (score >= 80) return "高热";
  if (score >= 65) return "偏强";
  if (score >= 45) return "中性";
  return "偏弱";
}

function animateNumber(el, target) {
  if (!el) return;
  const start = Number(el.textContent) || 0;
  const end = Number(target) || 0;
  if (start === end) { el.textContent = String(end); return; }
  const t0 = performance.now();
  const dur = 1100;
  function tick(now) {
    const t = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(start + (end - start) * eased));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// =============================================================
// Signal cards (market/ai) + sparkline
// =============================================================
function renderSignals(digest, marketSeries, aiSeries) {
  if (refs.marketSentiment) refs.marketSentiment.textContent = digest.marketSentiment || "—";
  if (refs.aiSentiment) refs.aiSentiment.textContent = digest.aiSentiment || "—";

  if (refs.marketDelta) refs.marketDelta.textContent = deltaText(marketSeries);
  if (refs.aiDelta) refs.aiDelta.textContent = deltaText(aiSeries);

  drawSparkline(refs.marketSpark, marketSeries, "hsl(189 80% 50%)");
  drawSparkline(refs.aiSpark, aiSeries, "hsl(160 70% 42%)");
}

function deltaText(series) {
  if (!series || series.length < 2) return "观察中";
  const diff = series[series.length - 1] - series[series.length - 2];
  if (Math.abs(diff) < 1) return "持平";
  const sign = diff > 0 ? "↑" : "↓";
  return `${sign} ${Math.abs(Math.round(diff))}`;
}

function drawSparkline(svg, values, color) {
  if (!svg) return;
  const W = 240, H = 56, padX = 4, padY = 8;
  const innerW = W - padX * 2, innerH = H - padY * 2;

  if (!values || values.length < 2) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="hsla(0 0% 100% / 0.3)" font-family="JetBrains Mono" font-size="11">—</text>`;
    return;
  }

  const xAt = (i) => padX + (innerW * i) / (values.length - 1);
  const yAt = (v) => padY + innerH - (clamp(v) / 100) * innerH;

  let d = `M ${xAt(0).toFixed(1)} ${yAt(values[0]).toFixed(1)}`;
  for (let i = 1; i < values.length; i++) d += ` L ${xAt(i).toFixed(1)} ${yAt(values[i]).toFixed(1)}`;
  const areaD = `${d} L ${xAt(values.length - 1).toFixed(1)} ${H - padY} L ${xAt(0).toFixed(1)} ${H - padY} Z`;
  const lastX = xAt(values.length - 1).toFixed(1);
  const lastY = yAt(values[values.length - 1]).toFixed(1);

  svg.innerHTML = `
    <defs>
      <linearGradient id="g-${svg.id}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaD}" fill="url(#g-${svg.id})"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX}" cy="${lastY}" r="3" fill="${color}"/>
  `;
}

// =============================================================
// Horizon chart (stacked area: composite/market/ai)
// =============================================================
function renderHorizon(history, latest) {
  if (!refs.horizonChart) return;
  refs.horizonChart.innerHTML = "";

  // 合并 latest + history → 按日期排序
  const points = [...history, latest]
    .map((d) => ({
      date: d.digestDate,
      composite: computeComposite(d),
      market: marketScore(d),
      ai: aiScore(d)
    }))
    .filter((p) => p.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (points.length < 2) {
    refs.horizonChart.innerHTML = `<p class="section-head__sub" style="text-align:center;padding:6rem 0">暂无足够历史数据</p>`;
    return;
  }

  const W = 1200, H = 320;
  const padX = 48, padTop = 24, padBottom = 40;
  const innerW = W - padX * 2, innerH = H - padTop - padBottom;

  const xAt = (i) => padX + (innerW * i) / (points.length - 1);
  const stackY = (i, v) => padTop + innerH - (v / 100) * innerH;

  // 三层面积（自下而上）：composite / market / ai
  const layers = [
    { key: "composite", color: "hsl(160 70% 42%)", id: "horizon-emerald" },
    { key: "market",    color: "hsl(189 80% 50%)", id: "horizon-cyan" },
    { key: "ai",        color: "hsl(262 70% 60%)", id: "horizon-violet" }
  ];

  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">`;

  // 网格
  const yTicks = [0, 25, 50, 75, 100];
  yTicks.forEach((t) => {
    const y = stackY(0, t);
    svg += `<line x1="${padX}" x2="${W - padX}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="hsla(0 0% 100% / 0.05)" stroke-width="1" stroke-dasharray="2 4"/>`;
    svg += `<text x="${padX - 12}" y="${y.toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-family="JetBrains Mono" font-size="11" fill="hsla(0 0% 100% / 0.4)">${t}</text>`;
  });

  // 面积层
  layers.forEach((layer) => {
    const path = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${stackY(i, p[layer.key]).toFixed(1)}`)
      .join(" ");
    const area = `${path} L ${xAt(points.length - 1).toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`;
    svg += `
      <defs>
        <linearGradient id="${layer.id}-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${layer.color}" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="${layer.color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#${layer.id}-fill)" opacity="0.85"/>
      <path d="${path}" fill="none" stroke="${layer.color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    `;
  });

  // 日期标签（最多 6 个）
  const step = Math.max(1, Math.floor((points.length - 1) / 5));
  for (let i = 0; i < points.length; i += step) {
    const x = xAt(i).toFixed(1);
    svg += `<text x="${x}" y="${H - 16}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="hsla(0 0% 100% / 0.4)">${formatShortDate(points[i].date)}</text>`;
  }
  if ((points.length - 1) % step !== 0) {
    const i = points.length - 1;
    svg += `<text x="${xAt(i).toFixed(1)}" y="${H - 16}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="hsla(0 0% 100% / 0.4)">${formatShortDate(points[i].date)}</text>`;
  }

  svg += `</svg>`;
  refs.horizonChart.innerHTML = svg;
}

function marketScore(d) {
  // 简化：取 chart series 第 0 个作为市场
  const s = d.chart?.series ?? [];
  return Number(s[0] ?? computeComposite(d)) || 0;
}

function aiScore(d) {
  const s = d.chart?.series ?? [];
  return Number(s[1] ?? computeComposite(d)) || 0;
}

// =============================================================
// Metrics rail (4 cards)
// =============================================================
function renderMetrics(history, latest) {
  if (!refs.metricsRail) return;
  const metrics = Array.isArray(latest.metrics) ? latest.metrics : [];
  if (metrics.length === 0) {
    refs.metricsRail.innerHTML = `<p class="section-head__sub">暂无指标数据</p>`;
    return;
  }

  const seriesByLabel = collectMetricHistory(history);
  refs.metricsRail.innerHTML = "";

  metrics.slice(0, 8).forEach((metric, idx) => {
    const card = document.createElement("article");
    card.className = "metric";
    card.style.setProperty("--metric-value", clamp(metric.value));
    card.style.animationDelay = `${idx * 80}ms`;

    const trendDir = trendDirection(metric.trend);
    const series = seriesByLabel[metric.label] || [];
    const delta = series.length >= 2 ? series[series.length - 1] - series[series.length - 2] : 0;

    const sparkId = `metric-spark-${idx}`;
    card.innerHTML = `
      <header class="metric__head">
        <span class="metric__label">${escapeHtml(metric.label)}</span>
        <span class="metric__score">${escapeHtml(scoreLabel(metric.value))}</span>
      </header>
      <div class="metric__value">
        <span>${metric.value}</span>
        <span class="metric__suffix">/ 100</span>
      </div>
      <span class="metric__trend ${trendDir ? `is-${trendDir}` : ""}">
        ${trendIcon(metric.trend)} ${escapeHtml(metric.trend ?? "观察中")}
      </span>
      <svg class="metric__spark" id="${sparkId}" viewBox="0 0 240 40" aria-hidden="true"></svg>
      <span class="metric__bar"><span class="metric__bar-fill"></span></span>
    `;
    refs.metricsRail.appendChild(card);
    drawSparkline(card.querySelector(`#${sparkId}`), series, "hsl(189 80% 50%)");
  });

  // 触发 flash
  requestAnimationFrame(() => {
    refs.metricsRail.querySelectorAll(".metric").forEach((c) => {
      c.classList.add("is-flash");
      setTimeout(() => c.classList.remove("is-flash"), 1200);
    });
  });
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

function trendDirection(trend) {
  if (!trend) return "";
  if (/强|涨|升|高|升温|修复|边际|↑/.test(trend)) return "up";
  if (/弱|跌|降|低|回落|承压|↓/.test(trend)) return "down";
  return "";
}

function trendIcon(trend) {
  if (!trend) return "·";
  if (/强|涨|升|高|升温|修复|边际|↑/.test(trend)) return "↑";
  if (/弱|跌|降|低|回落|承压|↓/.test(trend)) return "↓";
  return "·";
}

// =============================================================
// Constellation (focus areas as nodes)
// =============================================================
function renderConstellation(latest) {
  if (!refs.constellation) return;
  const W = 720, H = 400;
  // 安全区域: 节点位置 + 标签都必须在 viewBox 内 (避免文字被切)
  const SAFE = { x: 110, y: 36, r: 36 };
  const CX = W / 2, CY = H / 2;

  const marketItems = latest.marketItems ?? [];
  const aiItems = latest.aiItems ?? [];

  const nodes = [];
  const allItems = [
    ...marketItems.map((it, i) => ({ name: it, kind: "market", weight: 16 - i * 1.2 })),
    ...aiItems.map((it, i) => ({ name: it, kind: "ai", weight: 16 - i * 1.2 }))
  ];

  // 两层圆弧布局, 强制 clamp 到安全区域
  allItems.forEach((item, i) => {
    const layer = item.kind === "market" ? 0 : 1;
    const total = (item.kind === "market" ? marketItems.length : aiItems.length) || 1;
    const angle = (Math.PI * 1.2 * (i - (total - 1) / 2)) / total + Math.PI;
    const radius = layer === 0 ? 130 : 150;
    let cx = CX + Math.cos(angle) * radius + (Math.random() - 0.5) * 30;
    let cy = CY + Math.sin(angle) * radius * 0.7 + (Math.random() - 0.5) * 20;

    // clamp 到 viewBox 安全区 (留出 label 空间)
    const maxR = Math.max(8, item.weight);
    cx = Math.max(SAFE.x + maxR, Math.min(W - SAFE.x - maxR, cx));
    cy = Math.max(SAFE.y + maxR, Math.min(H - SAFE.y - maxR, cy));

    nodes.push({ ...item, cx, cy, r: maxR });
  });

  let svg = `<g class="constellation__lines">`;
  // 同类间连线
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].kind !== nodes[j].kind) continue;
      const dx = nodes[j].cx - nodes[i].cx;
      const dy = nodes[j].cy - nodes[i].cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 160) {
        svg += `<line class="constellation__line is-strong" x1="${nodes[i].cx.toFixed(1)}" y1="${nodes[i].cy.toFixed(1)}" x2="${nodes[j].cx.toFixed(1)}" y2="${nodes[j].cy.toFixed(1)}"/>`;
      }
    }
  }
  // 中心到节点
  nodes.forEach((n) => {
    svg += `<line class="constellation__line" x1="${CX}" y1="${CY}" x2="${n.cx.toFixed(1)}" y2="${n.cy.toFixed(1)}"/>`;
  });
  svg += `</g><g class="constellation__nodes">`;

  // 中心节点
  svg += `<circle cx="${CX}" cy="${CY}" r="20" fill="none" stroke="hsla(0 0% 100% / 0.2)" stroke-width="1" stroke-dasharray="2 4"/>`;
  svg += `<circle cx="${CX}" cy="${CY}" r="6" fill="hsl(160 70% 42%)" filter="drop-shadow(0 0 12px hsl(160 70% 42%))"/>`;
  svg += `<text x="${CX}" y="${CY + 38}" text-anchor="middle" font-family="IBM Plex Sans" font-size="10" font-weight="600" letter-spacing="0.18em" fill="hsl(0 0% 100% / 0.5)">TODAY</text>`;

  // 节点 — 标签智能锚点 (靠左 start / 靠右 end / 中间 middle)
  nodes.forEach((n) => {
    const color = n.kind === "market" ? "hsl(189 80% 50%)" : "hsl(160 70% 55%)";
    const fillSoft = n.kind === "market" ? "hsla(189 80% 50% / 0.2)" : "hsla(160 70% 42% / 0.2)";

    // 智能锚点: 靠左 → start, 靠右 → end, 中间 → middle
    let anchor = "middle";
    if (n.cx < SAFE.x + 80) anchor = "start";
    else if (n.cx > W - SAFE.x - 80) anchor = "end";

    // label y 不能超出 viewBox
    const labelY = Math.max(SAFE.y - 6, n.cy - n.r - 8);

    // 长 label 截断 (避免单字符宽度溢出 viewBox)
    const shortName = n.name.length > 18 ? n.name.slice(0, 17).trimEnd() + "…" : n.name;

    svg += `
      <g class="constellation__node" tabindex="0" role="button" aria-label="${escapeHtml(n.name)}">
        <circle class="constellation__node-core" cx="${n.cx.toFixed(1)}" cy="${n.cy.toFixed(1)}" r="${(n.r + 6).toFixed(1)}" fill="${fillSoft}"/>
        <circle cx="${n.cx.toFixed(1)}" cy="${n.cy.toFixed(1)}" r="${n.r.toFixed(1)}" fill="${color}"/>
        <text class="constellation__node-label" x="${n.cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}">${escapeHtml(shortName)}</text>
      </g>
    `;
  });

  svg += `</g>`;
  refs.constellation.innerHTML = svg;
}

// =============================================================
// Narrative
// =============================================================
function renderNarrative(latest) {
  if (!refs.narrative) return;
  const details = latest.details ?? [];
  if (details.length === 0) {
    refs.narrative.innerHTML = `<p class="section-head__sub">暂无简报详情</p>`;
    return;
  }
  refs.narrative.innerHTML = "";
  details.slice(0, 4).forEach((detail, idx) => {
    const card = document.createElement("article");
    card.className = "narrative-card";
    card.style.animationDelay = `${idx * 80}ms`;
    const num = String(idx + 1).padStart(2, "0");
    card.innerHTML = `
      <div class="narrative-card__head">
        <span class="narrative-card__num">${num}</span>
        <h3>${escapeHtml(detail.title)}</h3>
      </div>
      <p>${escapeHtml(detail.content)}</p>
    `;
    refs.narrative.appendChild(card);
  });
}

// =============================================================
// Cadence (large line chart with annotations)
// =============================================================
function renderCadence(history, latest) {
  if (!refs.cadenceChart) return;
  refs.cadenceChart.innerHTML = "";

  const all = [...history, latest]
    .map((d) => ({ date: d.digestDate, score: computeComposite(d) }))
    .filter((p) => p.date && Number.isFinite(p.score))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  paintCadenceStats(all);

  if (all.length < 2) {
    refs.cadenceChart.innerHTML = `<p class="section-head__sub" style="text-align:center;padding:6rem 0">暂无历史数据</p>`;
    return;
  }

  const W = 1200, H = 360;
  const padX = 56, padTop = 32, padBottom = 48;
  const innerW = W - padX * 2, innerH = H - padTop - padBottom;

  const xAt = (i) => padX + (innerW * i) / (all.length - 1);
  const yAt = (v) => padTop + innerH - (clamp(v) / 100) * innerH;

  const coords = all.map((p, i) => [xAt(i), yAt(p.score)]);
  const linePath = buildSmoothPath(coords);
  const areaPath = `${linePath} L ${xAt(all.length - 1).toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`;

  const yTicks = [0, 25, 50, 75, 100];
  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">`;

  yTicks.forEach((t) => {
    const y = yAt(t);
    svg += `<line x1="${padX}" x2="${W - padX}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="hsla(0 0% 100% / 0.04)" stroke-width="1" stroke-dasharray="2 6"/>`;
    svg += `<text x="${padX - 14}" y="${y.toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-family="JetBrains Mono" font-size="11" fill="hsla(0 0% 100% / 0.4)">${t}</text>`;
  });

  svg += `
    <defs>
      <linearGradient id="cadence-stroke" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="hsl(160 70% 42%)"/>
        <stop offset="50%" stop-color="hsl(189 80% 50%)"/>
        <stop offset="100%" stop-color="hsl(262 70% 60%)"/>
      </linearGradient>
      <linearGradient id="cadence-area" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="hsl(160 70% 42%)" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="hsl(160 70% 42%)" stop-opacity="0"/>
      </linearGradient>
    </defs>
  `;
  svg += `<path d="${areaPath}" fill="url(#cadence-area)"/>`;
  svg += `<path d="${linePath}" fill="none" stroke="url(#cadence-stroke)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" filter="drop-shadow(0 4px 16px hsla(160 70% 42% / 0.35))"/>`;

  // 数据点 + 注释
  all.forEach((p, i) => {
    const cx = xAt(i).toFixed(1);
    const cy = yAt(p.score).toFixed(1);
    svg += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="hsl(var(--background))" stroke="hsl(160 70% 42%)" stroke-width="2"/>`;
    if (i === all.length - 1) {
      // 最后一个点突出
      svg += `<circle cx="${cx}" cy="${cy}" r="6" fill="hsl(160 70% 42%)" opacity="0.25"/>`;
      svg += `<text x="${cx}" y="${(parseFloat(cy) - 18).toFixed(1)}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" font-weight="600" fill="hsl(160 70% 50%)">${p.score}</text>`;
    }
  });

  // x 轴标签
  const step = Math.max(1, Math.floor((all.length - 1) / 5));
  for (let i = 0; i < all.length; i += step) {
    svg += `<text x="${xAt(i).toFixed(1)}" y="${H - 18}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="hsla(0 0% 100% / 0.4)">${formatShortDate(all[i].date)}</text>`;
  }
  if ((all.length - 1) % step !== 0) {
    const i = all.length - 1;
    svg += `<text x="${xAt(i).toFixed(1)}" y="${H - 18}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="hsla(0 0% 100% / 0.4)">${formatShortDate(all[i].date)}</text>`;
  }

  svg += `</svg>`;
  refs.cadenceChart.innerHTML = svg;
}

function paintCadenceStats(points) {
  if (!refs.cadenceStats) return;
  if (!points.length) {
    refs.cadenceStats.innerHTML = "";
    return;
  }
  const scores = points.map((p) => p.score);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  const latest = points[points.length - 1].score;
  const prev = points.length > 1 ? points[points.length - 2].score : latest;
  const diff = latest - prev;
  const dirCls = diff > 0 ? "is-up" : diff < 0 ? "is-down" : "";

  refs.cadenceStats.innerHTML = `
    <div class="cadence__stat">
      <span class="cadence__stat-label">最新</span>
      <span class="cadence__stat-value ${dirCls}">${latest} ${diff === 0 ? "·" : diff > 0 ? "↑" : "↓"}</span>
    </div>
    <div class="cadence__stat">
      <span class="cadence__stat-label">峰值</span>
      <span class="cadence__stat-value">${max}</span>
    </div>
    <div class="cadence__stat">
      <span class="cadence__stat-label">均值</span>
      <span class="cadence__stat-value">${avg}</span>
    </div>
    <div class="cadence__stat">
      <span class="cadence__stat-label">谷值</span>
      <span class="cadence__stat-value">${min}</span>
    </div>
  `;
}

// Catmull–Rom → Bezier 平滑曲线
function buildSmoothPath(pts) {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]}`;
  const t = 0.18;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) * t;
    const cp1y = p1[1] + (p2[1] - p0[1]) * t;
    const cp2x = p2[0] - (p3[0] - p1[0]) * t;
    const cp2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

// =============================================================
// Ticker
// =============================================================
function renderTicker(latest, history) {
  if (!refs.tickerTrack) return;
  const items = buildTickerItems(latest, history);
  refs.tickerTrack.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (let i = 0; i < TICKER_DUPLICATE; i++) {
    items.forEach((it) => frag.appendChild(createTickerItem(it)));
  }
  refs.tickerTrack.appendChild(frag);
}

function buildTickerItems(latest, history) {
  const out = [];
  const metrics = latest?.metrics ?? [];
  metrics.forEach((m) => {
    const series = collectMetricHistory(history)[m.label] || [];
    const prev = series.length >= 2 ? series[series.length - 2] : m.value;
    const diff = m.value - prev;
    out.push({ key: m.label, value: m.value, delta: Number.isFinite(diff) ? diff : 0 });
  });
  if (out.length === 0) out.push({ key: "等待数据", value: "—", delta: 0 });
  return out;
}

function createTickerItem(item) {
  const el = document.createElement("span");
  el.className = "ticker-item";
  const dir = item.delta > 0 ? "is-up" : item.delta < 0 ? "is-down" : "is-flat";
  const arrow = item.delta > 0 ? "↑" : item.delta < 0 ? "↓" : "·";
  const sign = item.delta > 0 ? "+" : "";
  const txt = item.delta === 0 ? "0" : `${sign}${Math.round(item.delta)}`;
  el.innerHTML = `
    <span class="ticker-item__key">${escapeHtml(item.key)}</span>
    <span class="ticker-item__value">${escapeHtml(String(item.value))}</span>
    <span class="ticker-item__delta ${dir}">${arrow} ${escapeHtml(txt)}</span>
  `;
  return el;
}

// =============================================================
// 工具
// =============================================================
function clamp(v) {
  return Math.max(0, Math.min(100, Number(v) || 0));
}

function formatShortDate(value) {
  const d = new Date(value);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
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
