// AI 助手 chat 页面逻辑
// - 流式 SSE 调 /api/chat
// - 多轮会话(保留最近 20 条)
// - 错误展示
// - 建议 chip 一键发送

const stream = document.getElementById("chat-stream");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const send = document.getElementById("chat-send");
const statusPill = document.getElementById("status-pill");
const statusText = document.getElementById("status-text");
const suggest = document.getElementById("suggest-list");

let conversationHistory = []; // 多轮消息记录,后端只保留最近 20

const AI_AVATAR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 4 7v10l8 5 8-5V7l-8-5z"/><path d="M12 22V12"/><path d="m4 7 8 5 8-5"/></svg>`;
const USER_AVATAR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"/></svg>`;

function setStatus(state, text) {
  statusPill.classList.remove("is-busy", "is-error");
  if (state === "busy") statusPill.classList.add("is-busy");
  if (state === "error") statusPill.classList.add("is-error");
  statusText.textContent = text;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderLite(text) {
  // 极简渲染:换行分段、**加粗**、"- " 列表项
  const escaped = escapeHtml(text || "");
  return escaped
    .split(/\n{2,}/)
    .map((para) => {
      const lines = para.split(/\n/).map((line) => {
        if (/^[-*]\s+/.test(line)) {
          return "• " + line.replace(/^[-*]\s+/, "");
        }
        return line;
      });
      const inner = lines
        .map((line) => line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"))
        .join("<br>");
      return `<p>${inner}</p>`;
    })
    .join("");
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    stream.scrollTop = stream.scrollHeight;
  });
}

function makeMessage(role, content) {
  const div = document.createElement("div");
  div.className = `msg msg--${role}`;
  div.innerHTML = `
    <div class="msg__avatar msg__avatar--${role}" aria-hidden="true">
      ${role === "ai" ? AI_AVATAR_SVG : USER_AVATAR_SVG}
    </div>
    <div class="msg__bubble">
      <div class="msg__body"></div>
    </div>
  `;
  const body = div.querySelector(".msg__body");
  body.innerHTML = renderLite(content);
  stream.appendChild(div);
  scrollToBottom();
  return { node: div, body };
}

function setBubbleContent(body, content, withCursor) {
  body.innerHTML = renderLite(content) + (withCursor ? '<span class="cursor"></span>' : "");
  scrollToBottom();
}

async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  makeMessage("user", trimmed);
  conversationHistory.push({ role: "user", content: trimmed });

  // 发完第一次,隐藏建议
  if (suggest) {
    const welcome = suggest.closest(".msg--welcome");
    if (welcome) welcome.style.display = "none";
  }

  const ai = makeMessage("ai", "");
  setBubbleContent(ai.body, "", true);

  setStatus("busy", "思考中…");
  send.disabled = true;
  input.disabled = true;

  let fullContent = "";
  let contextDigestsUsed = null;

  try {
    const res = await fetch("/api/chat?stream=true", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream"
      },
      body: JSON.stringify({ messages: conversationHistory })
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j && j.message) errMsg = j.message;
      } catch (_) {
        // ignore
      }
      throw new Error(errMsg);
    }

    if (!res.body || !res.body.getReader) {
      throw new Error("浏览器不支持流式响应");
    }

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
          try {
            parsed = JSON.parse(data);
          } catch (_) {
            continue;
          }
          if (parsed.error) throw new Error(parsed.error);
          if (typeof parsed.delta === "string") {
            fullContent += parsed.delta;
            setBubbleContent(ai.body, fullContent, true);
          }
          if (typeof parsed.contextDigestsUsed === "number") {
            contextDigestsUsed = parsed.contextDigestsUsed;
          }
        }
      }
    }

    setBubbleContent(ai.body, fullContent, false);

    // 加 meta 信息
    if (contextDigestsUsed !== null) {
      const meta = document.createElement("div");
      meta.className = "msg__meta";
      meta.textContent = `基于 ${contextDigestsUsed} 条历史日报 · M3`;
      ai.body.parentElement.appendChild(meta);
    }

    conversationHistory.push({ role: "assistant", content: fullContent });
    // 多轮保留最近 20 条
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }

    setStatus(null, "就绪");
  } catch (err) {
    setBubbleContent(ai.body, `**出错了**\n\n${err.message || "未知错误"}`, false);
    ai.node.classList.add("msg--error");
    setStatus("error", "出错");
  } finally {
    send.disabled = !input.value.trim();
    input.disabled = false;
    input.focus();
  }
}

function autoResize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 8 * 24) + "px";
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value;
  input.value = "";
  autoResize();
  sendMessage(text);
});

input.addEventListener("input", () => {
  autoResize();
  send.disabled = !input.value.trim();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (input.value.trim()) form.requestSubmit();
  }
});

if (suggest) {
  suggest.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const q = chip.dataset.q;
    if (q) {
      input.value = q;
      autoResize();
      send.disabled = false;
      form.requestSubmit();
    }
  });
}

// 健康检查
fetch("/api/health")
  .then((r) => r.json())
  .then((d) => {
    if (d && d.ok) setStatus(null, "就绪");
  })
  .catch(() => setStatus("error", "后端不可达"));

input.focus();
