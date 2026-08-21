// feed.html 主逻辑:实时新闻 + AI 对话
// 所有数据 live fetch,零缓存

const feedList = document.getElementById("feed-list");
const newsCount = document.getElementById("news-count");
const refreshBtn = document.getElementById("refresh-btn");
const fetchPill = document.getElementById("fetch-pill");
const lastFetch = document.getElementById("last-fetch");
const chatStream = document.getElementById("chat-stream");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const chatModel = document.getElementById("chat-model");
const statusPill = document.getElementById("status-pill");
const statusText = document.getElementById("status-text");

let conversationHistory = [];

const AI_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 4 7v10l8 5 8-5V7l-8-5z"/><path d="M12 22V12"/><path d="m4 7 8 5 8-5"/></svg>`;
const USER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"/></svg>`;

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

function renderFeedItem(it) {
  const catClass = it.category === "ai" ? "feed-item__cat--ai" : "feed-item__cat--market";
  const catLabel = it.category === "ai" ? "AI" : "市场";
  const source = escapeHtml(it.source || "");
  const title = escapeHtml(it.title || "");
  const link = escapeHtml(it.link || "#");
  return `<a class="feed-item" href="${link}" target="_blank" rel="noopener noreferrer" role="listitem">
    <div class="feed-item__meta">
      <span class="${catClass}">${catLabel}</span>
      <span>·</span>
      <span>${source}</span>
    </div>
    <div class="feed-item__title">${title}</div>
  </a>`;
}

async function loadFeed() {
  fetchPill.textContent = "拉取中…";
  try {
    const res = await fetch("/api/news", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const items = data.items || [];
    feedList.innerHTML = items.length
      ? items.map(renderFeedItem).join("")
      : '<div class="loading-pill">暂无新闻</div>';
    newsCount.textContent = items.length + " 条 · " + (data.failedSources || []).length + " 源失败";
    lastFetch.textContent = "更新 " + new Date().toLocaleTimeString();
    fetchPill.textContent = "实时拉取,无缓存";
  } catch (e) {
    fetchPill.textContent = "❌ " + e.message;
    newsCount.textContent = "0 条";
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

function makeMessage(role, content) {
  const div = document.createElement("div");
  div.className = `msg msg--${role}`;
  div.innerHTML = `
    <div class="msg__avatar msg__avatar--${role}" aria-hidden="true">
      ${role === "ai" ? AI_SVG : USER_SVG}
    </div>
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

function autoResize() {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 8 * 24) + "px";
}

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

refreshBtn.addEventListener("click", loadFeed);

// 首屏:拉健康 + 新闻;放个欢迎 message
makeMessage("ai", "**Signal Board 已上线**\n\n左侧是实时新闻(每点 ↻ 刷新重拉,零缓存),右侧可以基于这些新闻问我。\n\n试试:\n- 今天 AI 行业最值得关注的 1 件事?\n- 半导体景气最近怎么样?\n- 总结一下今天的市场情绪");
loadHealth();
loadFeed();
chatInput.focus();
