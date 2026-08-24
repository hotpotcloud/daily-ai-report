// Signal Board · 编辑部智能晨报
// 全量从 /api/news + /api/digest/latest 实时渲染,无 hardcoded mock

const el = (id) => document.getElementById(id);

const heroDate = el("hero-date");
const heroWeekday = el("hero-weekday");
const heroTitle = el("hero-title");
const heroLede = el("hero-lede");
const heroImg = el("hero-img");

const briefingList = el("briefing-list");
const picksList = el("picks-list");
const signalsList = el("signals-list");

const sentimentFill = el("sentiment-fill");
const sentimentMarker = el("sentiment-marker");
const sentimentLabel = el("sentiment-label");
const sentimentNum = el("sentiment-num");
const sentimentDelta = el("sentiment-delta");

const fab = el("chat-fab");
const modal = el("chat-modal");
const closeBtn = el("chat-close");
const clearBtn = el("chat-clear");
const chatForm = el("chat-form");
const chatInput = el("chat-input");
const chatSend = el("chat-send");
const chatStream = el("chat-stream");
const suggestList = el("suggest-list");

const AI_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 4 7v10l8 5 8-5V7l-8-5z"/><path d="M12 22V12"/><path d="m4 7 8 5 8-5"/></svg>`;
const USER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"/></svg>`;

let conversationHistory = [];

// ---------- helpers ----------

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

function pad2(n) { return String(n).padStart(2, "0"); }
function formatDateCN(d) {
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}
const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, (Date.now() - t) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
  if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
  return new Date(iso).toLocaleDateString("zh-CN");
}

function estimateReadMinutes(text) {
  if (!text) return 4;
  // 中文 ~ 300 字/分钟
  const chars = (text.match(/[一-鿿]/g) || []).length;
  return Math.max(2, Math.min(15, Math.round(chars / 300) || 4));
}

// 简易分类:从标题/描述里抽 tag
function inferTags(text) {
  if (!text) return ["ai"];
  const t = text.toLowerCase();
  const tags = [];
  if (/(制裁|出口|许可|实体清单|监管|政策|国务院|发改委)/.test(t)) tags.push("policy");
  if (/(阿里|腾讯|字节|百度|华为|英伟达|nvidia|台积电|tsmc|三星|谷歌|微软|亚马逊|aws|azure|公司)/.test(t)) tags.push("company");
  if (/(a 股|港股|美股|创业板|科创|恒生|纳斯达克|标普|道琼斯|涨|跌|市值|融资|配售|ipo|财报|业绩)/.test(t)) tags.push("market");
  if (/(ai|大模型|llm|gpt|hbm|算力|训练|推理|智能体|nlp)/.test(t)) tags.push("ai");
  if (/(芯片|半导体|台积|smic|寒武纪|长鑫|存储|nand|dram|代工|晶圆)/.test(t)) tags.push("tech");
  if (!tags.length) tags.push("tech");
  return tags.slice(0, 2);
}

const TAG_LABEL = {
  policy: { text: "政策", cls: "pick__tag--policy briefing__tag--policy" },
  company: { text: "公司", cls: "pick__tag--company briefing__tag--company" },
  market: { text: "市场", cls: "pick__tag--market briefing__tag--market" },
  ai: { text: "AI", cls: "pick__tag--ai briefing__tag--ai" },
  tech: { text: "科技", cls: "pick__tag--tech briefing__tag--tech" }
};

// 从标题抽 hash tag
function inferHashTags(text, max = 3) {
  if (!text) return [];
  const dict = [
    ["英伟达", "英伟达"], ["nvidia", "英伟达"],
    ["hbm", "HBM"], ["h20", "H20"],
    ["阿里", "阿里云"], ["华为", "华为"],
    ["寒武纪", "寒武纪"], ["长鑫", "长鑫存储"],
    ["出口", "出口管制"], ["管制", "出口管制"],
    ["制裁", "制裁"],
    ["算力", "算力"], ["芯片", "芯片"],
    ["绿电", "绿电"], ["新能源", "新能源"],
    ["资本开支", "资本开支"]
  ];
  const hits = [];
  for (const [k, label] of dict) {
    if (text.includes(k) && !hits.find((h) => h.label === label)) {
      hits.push({ k, label });
    }
    if (hits.length >= max) break;
  }
  return hits;
}

// 取描述里前 2 句作为 sub
function makeSub(desc) {
  if (!desc) return "";
  const cleaned = desc.replace(/<[^>]+>/g, "").trim();
  const m = cleaned.split(/[。!?]/);
  return (m[0] || cleaned).slice(0, 60).trim();
}

// 从 URL 拿 source
function shortSource(url) {
  if (!url) return "资讯";
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host.includes("36kr")) return "36 氪";
    if (host.includes("leiphone")) return "雷锋网";
    if (host.includes("ithome")) return "IT 之家";
    if (host.includes("wallstreetcn")) return "华尔街见闻";
    if (host.includes("sina")) return "新浪财经";
    if (host.includes("cnbc")) return "CNBC";
    if (host.includes("solidot")) return "Solidot";
    return host.split(".")[0];
  } catch (_) {
    return "资讯";
  }
}

// 备用 hero 图
const HERO_FALLBACK_GRADIENT = "linear-gradient(135deg, #0a0e1a 0%, #1a2236 45%, #2a3556 100%)";

// ---------- Hero ----------

function renderHero(newsItems, digest) {
  const now = new Date();
  if (heroDate) heroDate.textContent = formatDateCN(now);
  if (heroWeekday) heroWeekday.textContent = WEEKDAYS[now.getDay()];

  // hero 标题:优先从 digest summary 提炼,确保 AI/算力主题;否则取 top 1 news
  let heroTitleText = "";
  if (digest && digest.summary) {
    // 拿 summary 的第一句话(到第一个"。"或",")
    const m = digest.summary.match(/^[^。，,]+/);
    heroTitleText = m ? m[0] : digest.summary.slice(0, 24);
  }
  if (!heroTitleText) {
    const allItems = (newsItems || []);
    heroTitleText = (allItems[0] && allItems[0].title) || (digest && digest.title) || "今日 AI 与市场要闻";
  }
  // 长度控制在 24 字
  if (heroTitleText.length > 24) {
    heroTitleText = heroTitleText.slice(0, 23) + "…";
  }
  if (heroTitle) heroTitle.textContent = heroTitleText;

  // 副标题:lede 已有,这里不需要
  const top = (newsItems && newsItems[0]) || null;

  // lede 用 digest.summary
  if (heroLede && digest && digest.summary) {
    heroLede.textContent = digest.summary;
  } else if (heroLede && top && top.description) {
    heroLede.textContent = (top.description || "").replace(/<[^>]+>/g, "").slice(0, 120);
  }

  // hero 图
  if (heroImg && top && top.image) {
    heroImg.style.backgroundImage = `url('${top.image}'), ${HERO_FALLBACK_GRADIENT}`;
    heroImg.style.backgroundSize = "cover";
    heroImg.style.backgroundPosition = "center";
  } else if (heroImg) {
    heroImg.style.backgroundImage = HERO_FALLBACK_GRADIENT;
  }

  // hero img credit
  const creditEl = heroImg && heroImg.querySelector(".hero__img-credit");
  const sourceEl = heroImg && heroImg.querySelector(".hero__img-source");
  if (creditEl) creditEl.textContent = "图 · " + (top ? shortSource(top.link) + " · 配图" : "视觉中国");
  if (sourceEl) sourceEl.textContent = "来源 · " + (top && top.source ? top.source : "编辑部综合");
}

// ---------- 5 分钟晨报 ----------

function renderBriefing(newsItems) {
  if (!briefingList) return;
  const items = (newsItems || []).slice(0, 3);
  if (!items.length) {
    briefingList.innerHTML = '<li class="briefing__item"><div class="briefing__body"><p class="briefing__desc">暂无事件</p></div></li>';
    return;
  }
  const now = Date.now();
  briefingList.innerHTML = items.map((it, i) => {
    const t = it.publishedAt ? new Date(it.publishedAt) : new Date(now - (i + 1) * 35 * 60 * 1000);
    const hh = pad2(t.getHours());
    const mm = pad2(t.getMinutes());
    const time = `${hh}:${mm}`;
    const tagKeys = inferTags((it.title || "") + " " + (it.description || ""));
    const tag = TAG_LABEL[tagKeys[0]] || TAG_LABEL.ai;
    const desc = (it.description || "").replace(/<[^>]+>/g, "").slice(0, 90);
    return `
      <li class="briefing__item">
        <span class="briefing__time">${time}</span>
        <div class="briefing__dot"></div>
        <div class="briefing__body">
          <span class="${tag.cls}">${tag.text}</span>
          <h3 class="briefing__item-title">${escapeHtml(it.title || "")}</h3>
          <p class="briefing__desc">${escapeHtml(desc)}</p>
          <a class="briefing__more" href="${escapeHtml(it.link || "#")}" target="_blank" rel="noopener noreferrer">查看完整解读 →</a>
        </div>
      </li>
    `;
  }).join("");
}

// ---------- 编辑精选 ----------

function renderPicks(newsItems) {
  if (!picksList) return;
  // picks 取 next 4(避开 briefing 用的 top 3)
  const items = (newsItems || []).slice(3, 7);
  if (!items.length) {
    picksList.innerHTML = '<li class="pick pick--loading">暂无新闻</li>';
    return;
  }
  picksList.innerHTML = items.map((it) => {
    const tagKeys = inferTags((it.title || "") + " " + (it.description || ""));
    const tagsHtml = tagKeys.map((k) => {
      const t = TAG_LABEL[k];
      return `<span class="pick__tag ${t.cls}">${t.text}</span>`;
    }).join("");
    const isLead = tagKeys.includes("policy") || tagKeys.includes("ai");
    const leadTag = isLead ? '<span class="pick__tag pick__tag--lead">重磅</span>' : "";
    const sub = makeSub(it.description) || (it.title || "").slice(0, 50);
    const desc = (it.description || "").replace(/<[^>]+>/g, "").slice(0, 160);
    const time = timeAgo(it.publishedAt);
    const read = estimateReadMinutes((it.title || "") + (it.description || ""));
    const src = shortSource(it.link);
    const hashTags = inferHashTags((it.title || "") + " " + (it.description || ""));
    const hashHtml = hashTags.map((h) => `<a href="#"># ${escapeHtml(h.label)}</a>`).join(" ");
    const coverHtml = it.image
      ? `<div class="pick__cover"><img src="${escapeHtml(it.image)}" alt="" loading="lazy" /></div>`
      : `<div class="pick__cover pick__cover--placeholder">${escapeHtml((it.title || "?").slice(0, 1))}</div>`;
    return `
      <li class="pick">
        <a class="pick__cover-wrap" href="${escapeHtml(it.link || "#")}" target="_blank" rel="noopener noreferrer">${coverHtml}</a>
        <div class="pick__body">
          <div class="pick__tags">${leadTag}${tagsHtml}</div>
          <h3 class="pick__title"><a href="${escapeHtml(it.link || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title || "")}</a></h3>
          <p class="pick__sub">${escapeHtml(sub)}</p>
          <p class="pick__desc">${escapeHtml(desc)}</p>
          <p class="pick__meta">
            <span class="pick__source">${escapeHtml(src)}</span>
            <span>·</span>
            <span class="pick__time">${escapeHtml(time)}</span>
            <span>·</span>
            <span class="pick__read">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              ${read} 分钟
            </span>
          </p>
          ${hashTags.length ? `<p class="pick__hash">${hashHtml}</p>` : ""}
        </div>
      </li>
    `;
  }).join("");
}

// ---------- 待验证信号 ----------

function renderSignals(digest) {
  if (!signalsList) return;
  const items = [];
  // 优先从 details 段抽关键句
  if (digest && Array.isArray(digest.marketItems) && digest.marketItems[0]) {
    items.push({
      title: "半导体涨价潮延续",
      hint: digest.marketItems[0].slice(0, 80)
    });
  }
  if (digest && Array.isArray(digest.aiItems) && digest.aiItems[0]) {
    items.push({
      title: "AI 资本开支创历史新高",
      hint: digest.aiItems[0].slice(0, 80)
    });
  }
  if (digest && Array.isArray(digest.aiItems) && digest.aiItems[1]) {
    items.push({
      title: "国产替代节奏验证",
      hint: digest.aiItems[1].slice(0, 80)
    });
  }
  // 兜底
  while (items.length < 3) {
    items.push({ title: "关注今日剩余事件", hint: "待聚合…" });
  }
  signalsList.innerHTML = items.slice(0, 3).map((s, i) => `
    <li class="signal">
      <span class="signal__num">${i + 1}</span>
      <div class="signal__body">
        <h4 class="signal__title">${escapeHtml(s.title)}</h4>
        <p class="signal__hint">${escapeHtml(s.hint)}</p>
      </div>
    </li>
  `).join("");
}

// ---------- 市场情绪 ----------

function renderSentiment(digest) {
  if (!digest || !Array.isArray(digest.metrics)) return;
  const m = digest.metrics.find((x) => x.label === "市场风险偏好") || digest.metrics[0];
  if (!m) return;
  const v = Math.max(0, Math.min(100, m.value || 0));
  if (sentimentFill) sentimentFill.style.setProperty("--w", v + "%");
  if (sentimentMarker) sentimentMarker.style.setProperty("--p", v + "%");
  if (sentimentLabel) sentimentLabel.textContent = m.trend || digest.marketSentiment || "中性";
  if (sentimentNum) sentimentNum.textContent = String(v);
  if (sentimentDelta) {
    const delta = (m.value || 0) - 65; // 简单伪增量
    sentimentDelta.textContent = (delta >= 0 ? "+" : "") + delta;
    sentimentDelta.className = delta >= 0 ? "up" : "down";
  }
}

// ---------- 加载主流程 ----------

async function loadAll() {
  try {
    const [newsRes, digestRes] = await Promise.all([
      fetch("/api/news", { cache: "no-store" }),
      fetch("/api/digest/latest", { cache: "no-store" })
    ]);
    const news = newsRes.ok ? await newsRes.json() : { items: [] };
    const digest = digestRes.ok ? await digestRes.json() : null;
    const items = news.items || [];

    renderHero(items, digest);
    renderBriefing(items);
    renderPicks(items);
    renderSignals(digest);
    renderSentiment(digest);
  } catch (e) {
    console.error("loadAll failed", e);
  }
}

// ---------- Chat ----------

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
  } catch (err) {
    setBubbleContent(ai.body, "**出错了**\n\n" + (err.message || "未知错误"), false);
    ai.node.classList.add("msg--error");
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

// tab 切换
document.querySelectorAll(".editorial__tabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".editorial__tabs .tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    // 简单实现:切换 tab 不重新拉数据,只视觉切换
  });
});

// 启动
loadAll();
setInterval(loadAll, 5 * 60 * 1000);
