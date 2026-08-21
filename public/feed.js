// Signal Board · Live feed 主逻辑
// - 顶部实时新闻(全宽)
// - 右下角浮窗 chat(FAB → modal)

const newsList = document.getElementById("news-grid-list");
const newsCount = document.getElementById("news-count");
const fetchPill = document.getElementById("fetch-pill");
const lastFetch = document.getElementById("last-fetch");
const refreshBtn = document.getElementById("refresh-btn");
const newsEmpty = document.getElementById("news-empty");

const fab = document.getElementById("chat-fab");
const modal = document.getElementById("chat-modal");
const modalPanel = modal.querySelector(".chat-modal__panel");
const closeBtn = document.getElementById("chat-close");
const clearBtn = document.getElementById("chat-clear");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const chatStream = document.getElementById("chat-stream");
const chatModel = document.getElementById("chat-model");
const suggestList = document.getElementById("suggest-list");

const statusPill = document.getElementById("status-pill");
const statusText = document.getElementById("status-text");

const AI_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 4 7v10l8 5 8-5V7l-8-5z"/><path d="M12 22V12"/><path d="m4 7 8 5 8-5"/></svg>`;
const USER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"/></svg>`;

let conversationHistory = [];

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

function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, (Date.now() - t) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
  if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
  if (diff < 7 * 86400) return Math.floor(diff / 86400) + " 天前";
  return new Date(iso).toLocaleDateString();
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

// ---------- 新闻 ----------

function renderNewsCard(item) {
  const cat = item.category === "ai" ? "ai" : "market";
  const catLabel = cat === "ai" ? "AI" : "市场";
  const source = escapeHtml(item.source || "");
  const title = escapeHtml(item.title || "");
  const link = escapeHtml(item.link || "#");
  const time = timeAgo(item.publishedAt);
  return `<a class="news-card" href="${link}" target="_blank" rel="noopener noreferrer" role="listitem">
    <div class="news-card__meta">
      <span class="news-card__tag news-card__tag--${cat}">${catLabel}</span>
      <span class="news-card__sep">·</span>
      <span class="news-card__source">${source}</span>
    </div>
    <div class="news-card__title">${title}</div>
    ${time ? `<div class="news-card__time">${time}</div>` : ""}
  </a>`;
}

async function loadFeed() {
  fetchPill.textContent = "拉取中…";
  refreshBtn.classList.add("is-loading");
  try {
    const res = await fetch("/api/news", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const items = data.items || [];
    if (items.length) {
      newsList.innerHTML = items.map(renderNewsCard).join("");
      newsEmpty.hidden = true;
    } else {
      newsList.innerHTML = "";
      newsEmpty.hidden = false;
    }
    const failedCount = (data.failedSources || []).length;
    newsCount.textContent = items.length + " 条";
    if (failedCount) {
      fetchPill.textContent = "实时拉取 · 零缓存 · " + failedCount + " 源失败";
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
  // 强制 reflow,让 transition 生效
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

  // 隐藏建议
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
  // 保留 welcome message,删其他
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

// 点 modal 背景关闭
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

// ESC 关闭
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closeModal();
});

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

// 启动
loadHealth();
loadFeed();
// 每 5 分钟自动拉一次
setInterval(loadFeed, 5 * 60 * 1000);
