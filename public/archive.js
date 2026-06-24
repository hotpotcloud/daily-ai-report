// =============================================================
// Archive · 历史日报归档
// - 拉取 /api/digests?limit=30
// - 倒序展示, 每条卡片: 日期 / 情绪 / 标题 / 摘要 / 综合得分环
// - 搜索 + 情绪过滤
// - 展开看完整 details
// =============================================================

const refs = {
  list: document.querySelector("#archive-list"),
  skeleton: document.querySelector("#archive-skeleton"),
  empty: document.querySelector("#archive-empty"),
  end: document.querySelector("#archive-end"),
  count: document.querySelector("#archive-count"),
  search: document.querySelector("#archive-search"),
  chips: document.querySelector("#archive-filter-chips")
};

const state = {
  digests: [],
  filter: "all",
  search: ""
};

// =============================================================
// Boot
// =============================================================
async function bootstrap() {
  setupReveal();
  await load();
  bindFilters();
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
// Data
// =============================================================
async function load() {
  try {
    const res = await fetch("/api/digests?limit=30", { cache: "no-store" });
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    state.digests = Array.isArray(data) ? data : [];
    render();
  } catch (err) {
    state.digests = [];
    render();
  }
}

function render() {
  if (!refs.skeleton) return;
  refs.skeleton.remove();
  refs.skeleton.parentElement; // noop

  const filtered = applyFilters(state.digests);
  if (refs.count) {
    refs.count.textContent = `${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`;
  }

  if (filtered.length === 0) {
    refs.list.innerHTML = "";
    refs.empty.hidden = false;
    refs.end.hidden = true;
    return;
  }

  refs.empty.hidden = true;
  refs.end.hidden = false;
  refs.list.innerHTML = "";
  filtered.forEach((d, idx) => {
    const card = buildCard(d, idx);
    refs.list.appendChild(card);
  });
}

function applyFilters(list) {
  let out = list;
  if (state.filter !== "all") {
    out = out.filter((d) => {
      const score = computeComposite(d);
      if (state.filter === "up") return score >= 65;
      if (state.filter === "neutral") return score >= 45 && score < 65;
      if (state.filter === "down") return score < 45;
      return true;
    });
  }
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    out = out.filter((d) => {
      const hay = [
        d.digestDate, d.title, d.summary,
        ...(d.marketItems || []), ...(d.aiItems || []),
        ...((d.details || []).map((x) => `${x.title} ${x.content}`))
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }
  return out;
}

// =============================================================
// Card Builder
// =============================================================
function buildCard(d, idx) {
  const card = document.createElement("article");
  card.className = "digest-card";
  card.style.animationDelay = `${idx * 60}ms`;

  const score = computeComposite(d);
  const dir = sentimentDir(d, score);
  const dirLabel = {
    up: "偏强", neutral: "中性", down: "偏弱"
  }[dir];
  const aiSent = d.aiSentiment || "—";

  card.innerHTML = `
    <div class="digest-card__main">
      <div class="digest-card__head">
        <span class="digest-card__date mono">${escapeHtml(d.digestDate || "—")}</span>
        <span class="digest-card__sentiment is-${dir}">
          <span class="digest-card__sentiment-dot"></span>
          <span class="mono">${escapeHtml(dirLabel)} · ${escapeHtml(aiSent)}</span>
        </span>
      </div>

      <h3 class="digest-card__title">${escapeHtml(d.title || "(无标题)")}</h3>

      <p class="digest-card__summary">${escapeHtml(truncate(d.summary || "", 240))}</p>

      <div class="digest-card__meta">
        <span class="digest-card__meta-item">
          <span>综合</span>
          <strong class="mono">${score}</strong>
        </span>
        <span class="digest-card__meta-item">
          <span>市场</span>
          <strong>${escapeHtml(d.marketSentiment || "—")}</strong>
        </span>
        <span class="digest-card__meta-item">
          <span>指标</span>
          <strong class="mono">${(d.metrics || []).length}</strong>
        </span>
      </div>

      ${(d.details && d.details.length) ? `
        <button class="digest-card__expand" type="button" aria-expanded="false">
          <span>查看完整</span>
          <span class="digest-card__expand-arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </span>
        </button>
        <div class="digest-card__details">
          ${d.details.map((detail, i) => `
            <div class="digest-card__detail">
              <span class="digest-card__detail-num">${String(i + 1).padStart(2, "0")}</span>
              <div class="digest-card__detail-content">
                <h4 class="digest-card__detail-title">${escapeHtml(detail.title || "")}</h4>
                <p class="digest-card__detail-text">${escapeHtml(detail.content || "")}</p>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>

    <div class="digest-card__aside">
      <div class="digest-card__score" style="--score-deg: ${Math.round((score / 100) * 360)}deg">
        <div class="digest-card__score-core">
          <span class="digest-card__score-num">${score}</span>
          <span class="digest-card__score-label">/ 100</span>
        </div>
      </div>
    </div>
  `;

  // Expand toggle
  const expandBtn = card.querySelector(".digest-card__expand");
  if (expandBtn) {
    expandBtn.addEventListener("click", () => {
      const isExpanded = card.classList.toggle("is-expanded");
      expandBtn.setAttribute("aria-expanded", String(isExpanded));
      expandBtn.querySelector("span:first-child").textContent = isExpanded ? "收起" : "查看完整";
    });
  }

  return card;
}

function sentimentDir(d, score) {
  if (score >= 65) return "up";
  if (score >= 45) return "neutral";
  return "down";
}

function computeComposite(d) {
  const metrics = Array.isArray(d.metrics) ? d.metrics : [];
  if (metrics.length) {
    return Math.round(metrics.reduce((s, m) => s + Number(m.value || 0), 0) / metrics.length);
  }
  const series = Array.isArray(d.chart?.series) ? d.chart.series : [];
  if (!series.length) return 0;
  return Math.round(series.reduce((s, v) => s + Number(v || 0), 0) / series.length);
}

function truncate(text, n) {
  if (!text) return "";
  return text.length > n ? text.slice(0, n).trimEnd() + "…" : text;
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
// Filters
// =============================================================
function bindFilters() {
  if (refs.search) {
    let timer = 0;
    refs.search.addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.search = e.target.value;
        render();
      }, 150);
    });
  }

  if (refs.chips) {
    refs.chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-chip");
      if (!btn) return;
      refs.chips.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.filter = btn.dataset.filter;
      render();
    });
  }
}

// =============================================================
// Boot
// =============================================================
bootstrap();
