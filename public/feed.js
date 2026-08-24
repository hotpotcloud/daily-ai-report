// Signal Board · Editorial
// 实时新闻(瀑布流) + AI 整理日报(大字) + AI 浮窗

const el = (id) => document.getElementById(id);

const mastheadDate = el("masthead-date");
const heroDate = el("hero-date");
const heroQuote = el("hero-quote");
const heroMarketSent = el("hero-market-sentiment");
const heroMarketTrend = el("hero-market-trend");
const heroAiSent = el("hero-ai-sentiment");
const heroAiTrend = el("hero-ai-trend");
const tickerBarGrid = el("ticker-bar-grid");
const tickerBarHint = el("ticker-bar-hint");
const briefsAiList = el("briefs-ai-list");
const briefsMarketList = el("briefs-market-list");
const briefsAnalysis = el("briefs-analysis");
const newsRiver = el("news-river");
const newsFeatured = el("news-featured");
const newsCount = el("news-count");
const fetchPill = el("fetch-pill");
const lastFetch = el("last-fetch");
const refreshBtn = el("refresh-btn");
const newsEmpty = el("news-empty");
const newsFilters = el("news-filters");

const statusPill = el("status-pill");
const statusText = el("status-text");

const fab = el("chat-fab");
const modal = el("chat-modal");
const closeBtn = el("chat-close");
const clearBtn = el("chat-clear");
const chatForm = el("chat-form");
const chatInput = el("chat-input");
const chatSend = el("chat-send");
const chatStream = el("chat-stream");
const chatModel = el("chat-model");
const suggestList = el("suggest-list");

const AI_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 4 7v10l8 5 8-5V7l-8-5z"/><path d="M12 22V12"/><path d="m4 7 8 5 8-5"/></svg>`;
const USER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"/></svg>`;

let conversationHistory = [];
let newsData = [];
let currentFilter = "all";

// ---------- helpers ----------

function setStatus(state, text) {
  statusPill.classList.remove("is-busy", "is-error");
  if (state === "busy") statusPill.classList.add("is-busy");
  if (state === "error") statusPill.classList.add("is-error");
  statusText.textContent = text;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function renderLite(text) {
  const escaped = escapeHtml(text || "");
  return escaped
    .split(/\n{2,}/)
    .map((para) => {
      const lines = para.split(/\n/).map((line) =>
        /^[-*]\s+/.test(line) ? "• " + line.replace(/^[-*]\s+/, "") : line
      );
      const inner = lines
        .map((line) => line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"))
        .join("<br>");
      return `<p>${inner}</p>`;
    })
    .join("");
}

function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, (Date.now() - t) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
  if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
  if (diff < 7 * 86400) return Math.floor(diff / 86400) + " 天前";
  return new Date(iso).toLocaleDateString("zh-CN");
}

function pad2(n) { return String(n).padStart(2, "0"); }
function formatDateCN(d) {
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}

// ---------- Hero (大字摘要 + 情绪) ----------

function renderHero(data) {
  if (!data || !data.digestDate) {
    heroQuote.innerHTML = "<p>今日 AI 整理日报还没生成 · 等每天 8:00 定时任务跑(UTC 0:00 / 北京 8:00)。</p>";
    heroDate.textContent = "—";
    heroMarketSent.textContent = "—";
    heroAiSent.textContent = "—";
    heroMarketTrend.textContent = "—";
    heroAiTrend.textContent = "—";
    return;
  }
  heroDate.textContent = data.digestDate;
  const summary = data.summary || "(无摘要)";
  heroQuote.innerHTML = `<p>${escapeHtml(summary)}</p>`;
  heroMarketSent.textContent = data.marketSentiment || "—";
  heroAiSent.textContent = data.aiSentiment || "—";
  const marketMetrics = (data.metrics || []).find(m => m.label === "市场风险偏好");
  const aiMetrics = (data.metrics || []).find(m => m.label === "AI 热度");
  heroMarketTrend.textContent = marketMetrics ? `${marketMetrics.value} / 100 · ${marketMetrics.trend || ""}` : "—";
  heroAiTrend.textContent = aiMetrics ? `${aiMetrics.value} / 100 · ${aiMetrics.trend || ""}` : "—";
}

// ---------- Ticker Bar (4 metric) ----------

function renderTicker(data) {
  const metrics = (data && data.metrics) || [];
  if (!metrics.length) {
    tickerBarGrid.innerHTML = "";
    tickerBarHint.textContent = "暂无指标";
    return;
  }
  tickerBarHint.textContent = metrics.length + " 项 · 100 制";
  tickerBarGrid.innerHTML = metrics.slice(0, 4).map((m, i) => `
    <div class="metric" role="listitem">
      <span class="metric__no">№ 0${i + 1}</span>
      <div class="metric__label">${escapeHtml(m.label || "")}</div>
      <div class="metric__value">${Math.max(0, Math.min(100, Number(m.value) || 0))}</div>
      <div class="metric__trend">${escapeHtml(m.trend || "—")}</div>
      <div class="metric__bar"><span class="metric__bar-fill" style="width:${Math.max(0, Math.min(100, Number(m.value) || 0))}%"></span></div>
    </div>
  `).join("");
}

// ---------- Briefs (AI / Market 双列) ----------

function renderBriefs(data) {
  briefsAiList.innerHTML = "";
  briefsMarketList.innerHTML = "";
  briefsAnalysis.innerHTML = "";

  const ai = (data && data.aiItems) || [];
  const market = (data && data.marketItems) || [];
  const details = (data && data.details) || [];

  briefsAiList.style.counterReset = "brief";
  briefsMarketList.style.counterReset = "brief";

  briefsAiList.innerHTML = ai.length
    ? ai.slice(0, 6).map(s => `<li><span>${escapeHtml(s)}</span></li>`).join("")
    : '<li><span style="color:var(--fg-mute)">暂无 AI 重点</span></li>';
  briefsMarketList.innerHTML = market.length
    ? market.slice(0, 6).map(s => `<li><span>${escapeHtml(s)}</span></li>`).join("")
    : '<li><span style="color:var(--fg-mute)">暂无市场重点</span></li>';

  // 深度分析:可折叠 details,默认全部展开(右侧本来短,展开补高度)
  if (details.length) {
    briefsAnalysis.innerHTML = details.slice(0, 3).map((d, i) => `
      <details open>
        <summary>
          <span>${escapeHtml(d.title || "分析")}</span>
          <span class="analysis__no mono">№ 0${i + 1}</span>
        </summary>
        <div class="analysis__body">${escapeHtml(d.content || "")}</div>
      </details>
    `).join("");
  } else {
    briefsAnalysis.innerHTML = '<p style="color:var(--fg-mute);font-size:0.82rem;padding:0.5rem 0">深度分析等每日 8:00 定时任务生成</p>';
  }
}

// ---------- News River (瀑布流) ----------

function renderNews(items) {
  const filtered = currentFilter === "all"
    ? items
    : items.filter(it => it.category === currentFilter);

  if (!filtered.length) {
    newsRiver.innerHTML = "";
    newsFeatured.innerHTML = "";
    newsEmpty.hidden = false;
    newsCount.textContent = "0 条";
    return;
  }
  newsEmpty.hidden = true;

  // 1) 焦点卡片:第一条有图的(优先)或第一条
  const featured = filtered.find(it => it.image) || filtered[0];
  const rest = filtered.filter(it => it !== featured);
  newsFeatured.innerHTML = renderFeatured(featured);

  // 2) 列表:缩略图卡(2-col 网格)
  newsRiver.innerHTML = rest.map((it, idx) => {
    const cat = it.category || "tech";
    const catLabel = cat === "ai" ? "AI" : cat === "market" ? "市场" : "科技";
    const no = String(idx + 1).padStart(3, "0");
    const thumb = it.image
      ? `<div class="news-card__thumb"><img src="${escapeHtml(it.image)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('news-card__thumb--empty');this.remove();" /></div>`
      : `<div class="news-card__thumb news-card__thumb--empty"><span class="news-card__thumb-mark">${catLabel[0]}</span></div>`;
    return `<a class="news-card" href="${escapeHtml(it.link || "#")}" target="_blank" rel="noopener noreferrer" role="listitem" data-cat="${cat}">
      ${thumb}
      <div class="news-card__body">
        <div class="news-card__kicker">
          <span class="cat cat--${cat}">${catLabel}</span>
          <span class="news-card__source">${escapeHtml(it.source || "")}</span>
        </div>
        <h3 class="news-card__title">${escapeHtml(it.title || "")}</h3>
        <div class="news-card__time mono">${escapeHtml(timeAgo(it.publishedAt) || "—")}</div>
      </div>
    </a>`;
  }).join("");

  newsCount.textContent = filtered.length + " 条";
}

function renderFeatured(it) {
  if (!it) return "";
  const cat = it.category || "tech";
  const catLabel = cat === "ai" ? "AI" : cat === "market" ? "市场" : "科技";
  const img = it.image
    ? `<div class="featured__image"><img src="${escapeHtml(it.image)}" alt="" loading="eager" onerror="this.parentNode.classList.add('featured__image--empty');this.remove();" /></div>`
    : `<div class="featured__image featured__image--empty"><span class="featured__image-mark">${catLabel}</span></div>`;
  return `<a class="featured" href="${escapeHtml(it.link || "#")}" target="_blank" rel="noopener noreferrer" data-cat="${cat}">
    ${img}
    <div class="featured__body">
      <div class="featured__kicker">
        <span class="cat cat--${cat}">${catLabel}</span>
        <span class="featured__source mono">${escapeHtml(it.source || "")}</span>
        <span class="featured__no mono">№ TOP</span>
      </div>
      <h3 class="featured__title">${escapeHtml(it.title || "")}</h3>
      ${it.description ? `<p class="featured__desc">${escapeHtml(it.description)}</p>` : ""}
      <div class="featured__meta mono">
        ${it.publishedAt ? escapeHtml(timeAgo(it.publishedAt)) : "—"}
      </div>
    </div>
  </a>`;
}

// ---------- 数据加载 ----------

async function loadFeed() {
  fetchPill.textContent = "拉取中…";
  refreshBtn.classList.add("is-loading");
  try {
    const res = await fetch("/api/news", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    newsData = data.items || [];
    renderNews(newsData);

    const failed = (data.failedSources || []).length;
    const filtered = data.filteredNonChinese || 0;
    if (failed && filtered) {
      fetchPill.textContent = `实时拉取 · 零缓存 · ${failed} 源失败 · 过滤 ${filtered} 条非中文`;
    } else if (failed) {
      fetchPill.textContent = `实时拉取 · 零缓存 · ${failed} 源失败`;
    } else if (filtered) {
      fetchPill.textContent = `实时拉取 · 零缓存 · 过滤 ${filtered} 条非中文`;
    } else {
      fetchPill.textContent = "实时拉取 · 零缓存";
    }
    lastFetch.textContent = "更新 " + new Date().toLocaleTimeString("zh-CN", { hour12: false });
  } catch (e) {
    fetchPill.textContent = "❌ " + e.message;
    newsCount.textContent = "0 条";
  } finally {
    refreshBtn.classList.remove("is-loading");
  }
}

async function loadDigest() {
  try {
    const res = await fetch("/api/digest/latest", { cache: "no-store" });
    if (res.status === 404) {
      renderHero(null);
      renderTicker(null);
      renderBriefs(null);
      return;
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    renderHero(data);
    renderTicker(data);
    renderBriefs(data);
    if (data._generatedAt) {
      const dt = new Date(data._generatedAt);
      mastheadDate.textContent = formatDateCN(dt) + " · M3";
    } else if (data.digestDate) {
      mastheadDate.textContent = data.digestDate + " · M3";
    }
  } catch (e) {
    renderHero(null);
    renderTicker(null);
    renderBriefs(null);
  }
}

async function loadHealth() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.ok) {
      setStatus(null, data.has_api_key ? "就绪" : "缺 API key");
      chatModel.textContent = data.model || "—";
    } else {
      setStatus("error", "异常");
    }
  } catch (e) {
    setStatus("error", "后端不可达");
  }
}

// ---------- Chat modal ----------

function openModal() {
  modal.hidden = false;
  void modal.offsetHeight;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  fab.setAttribute("aria-expanded", "true");
  fab.hidden = true;
  setTimeout(() => chatInput.focus(), 50);
}

function closeModal() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  fab.setAttribute("aria-expanded", "false");
  fab.hidden = false;
  setTimeout(() => { modal.hidden = true; }, 220);
}

function makeMessage(role, content) {
  const div = document.createElement("div");
  div.className = `msg msg--${role}`;
  div.innerHTML = `
    <div class="msg__avatar msg__avatar--${role}" aria-hidden="true">${role === "ai" ? AI_SVG : USER_SVG}</div>
    <div class="msg__bubble"><div class="msg__body"></div></div>
  `;
  const body = div.querySelector(".msg__body");
  body.innerHTML = renderLite(content);
  chatStream.appendChild(div);
  chatStream.scrollTop = chatStream.scrollHeight;
  return { node: div, body };
}

function setBubbleContent(body, content, withCursor) {
  body.innerHTML = renderLite(content) + (withCursor ? '<span class="cursor"></span>' : "");
  chatStream.scrollTop = chatStream.scrollHeight;
}

async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  makeMessage("user", trimmed);
  conversationHistory.push({ role: "user", content: trimmed });

  if (suggestList) {
    const welcome = suggestList.closest(".msg--welcome");
    if (welcome) welcome.style.display = "none";
  }

  const ai = makeMessage("ai", "");
  setBubbleContent(ai.body, "", true);

  setStatus("busy", "思考中…");
  chatSend.disabled = true;
  chatInput.disabled = true;

  let fullContent = "";
  try {
    const res = await fetch("/api/chat?stream=true", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ messages: conversationHistory })
    });
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (_) {}
      throw new Error(msg);
    }
    if (!res.body || !res.body.getReader) throw new Error("浏览器不支持流式");

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of block.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          let parsed;
          try { parsed = JSON.parse(data); } catch (_) { continue; }
          if (parsed.error) throw new Error(parsed.error);
          if (typeof parsed.delta === "string") {
            fullContent += parsed.delta;
            setBubbleContent(ai.body, fullContent, true);
          }
        }
      }
    }
    setBubbleContent(ai.body, fullContent, false);
    conversationHistory.push({ role: "assistant", content: fullContent });
    if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);
    setStatus(null, "就绪");
  } catch (err) {
    setBubbleContent(ai.body, "**出错了**\n\n" + (err.message || "未知错误"), false);
    ai.node.classList.add("msg--error");
    setStatus("error", "出错");
  } finally {
    chatSend.disabled = !chatInput.value.trim();
    chatInput.disabled = false;
    chatInput.focus();
  }
}

function clearChat() {
  conversationHistory = [];
  Array.from(chatStream.querySelectorAll(".msg")).forEach((m) => {
    if (!m.classList.contains("msg--welcome")) m.remove();
  });
  const welcome = chatStream.querySelector(".msg--welcome");
  if (welcome) welcome.style.display = "";
}

function autoResize() {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 7.5 * 16) + "px";
}

// ---------- events ----------

fab.addEventListener("click", openModal);
closeBtn.addEventListener("click", closeModal);
clearBtn.addEventListener("click", clearChat);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

refreshBtn.addEventListener("click", () => loadFeed());

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value;
  chatInput.value = "";
  autoResize();
  sendMessage(text);
});

chatInput.addEventListener("input", () => {
  autoResize();
  chatSend.disabled = !chatInput.value.trim();
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (chatInput.value.trim()) chatForm.requestSubmit();
  }
});

if (suggestList) {
  suggestList.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const q = chip.dataset.q;
    if (q) {
      chatInput.value = q;
      autoResize();
      chatSend.disabled = false;
      chatForm.requestSubmit();
    }
  });
}

newsFilters.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter");
  if (!btn) return;
  newsFilters.querySelectorAll(".filter").forEach(b => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  currentFilter = btn.dataset.cat;
  renderNews(newsData);
});

// 启动
loadHealth();
loadDigest();
loadFeed();
setInterval(loadFeed, 5 * 60 * 1000);
