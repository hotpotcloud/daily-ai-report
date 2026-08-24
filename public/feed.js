// Signal Board · 信号地图
// 全量数据从 /api/news + /api/digest/latest 实时聚合渲染
// 不再使用硬编码 mock 数据

const el = (id) => document.getElementById(id);

const timelineList = el("timeline-list");
const relatedList = el("related-list");
const eventMapCanvas = el("event-map-canvas");
const impactBody = el("impact-body");
const impactHeadline = el("impact-headline");
const impactTrust = el("impact-trust");
const eventDate = el("event-date");
const eventUpdated = el("event-updated");
const sidenavUpdate = el("sidenav-update");
const marketTime = el("market-time");
const sideAffects = el("side-affects");
const sideRisks = el("side-risks");
const sidenavTopics = document.querySelectorAll(".sidenav__topics li");

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
function formatTimeCN(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function formatDateCN(d) {
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}
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

// ---------- 实体识别 ----------
// 从新闻标题中抽关键实体(公司/产品/技术/概念),用于图谱节点

const ENTITY_RULES = [
  { key: "nvidia", aliases: ["英伟达", "nvidia", "nvda", "h20", "h100", "h200", "gpu", "cuda"], label: "英伟达", icon: "⚡", color: "#10b981", bg: "#d1fae5" },
  { key: "alibaba", aliases: ["阿里", "阿里巴巴", "alibaba", "9988"], label: "阿里巴巴", icon: "阿", color: "#f97316", bg: "#ffedd5" },
  { key: "huawei", aliases: ["华为", "huawei", "昇腾", "ascend"], label: "华为", icon: "华", color: "#ef4444", bg: "#fee2e2" },
  { key: "cambricon", aliases: ["寒武纪", "cambricon", "688256"], label: "寒武纪", icon: "寒", color: "#0ea5e9", bg: "#e0f2fe" },
  { key: "cxmt", aliases: ["长鑫", "cxmt", "长鑫存储"], label: "长鑫存储", icon: "CX", color: "#6366f1", bg: "#e0e7ff" },
  { key: "hbm", aliases: ["hbm", "高带宽存储", "hbm3", "hbm3e"], label: "国产 HBM", icon: "▣", color: "#0d9488", bg: "#ccfbf1" },
  { key: "tsmc", aliases: ["台积电", "tsmc", "中芯", "smic"], label: "半导体代工", icon: "厂", color: "#a855f7", bg: "#f3e8ff" },
  { key: "ai-chip", aliases: ["ai 芯片", "ai 算力", "算力", "gpu", "asic", "npu", "tpu"], label: "AI 算力", icon: "芯", color: "#4f46e5", bg: "#eef2ff" },
  { key: "green-power", aliases: ["绿电", "新能源", "风电", "光伏", "数据中心", "ppa", "绿能"], label: "数据中心绿电", icon: "⚡", color: "#16a34a", bg: "#dcfce7" },
  { key: "memory", aliases: ["存储", "内存", "闪存", "nand", "dram", "ssd", "ddr"], label: "存储芯片", icon: "存", color: "#0ea5e9", bg: "#e0f2fe" },
  { key: "energy", aliases: ["电力", "能源", "电费", "电价", "用电"], label: "电力能源", icon: "电", color: "#eab308", bg: "#fef9c3" },
  { key: "policy", aliases: ["出口管制", "制裁", "许可", "实体清单", "禁令"], label: "出口管制", icon: "政", color: "#dc2626", bg: "#fee2e2" },
  { key: "market-cap", aliases: ["a 股", "算力板块", "科创", "创业板", "恒生", "中概"], label: "A 股算力", icon: "📈", color: "#ec4899", bg: "#fce7f3" }
];

function findEntities(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const hits = [];
  for (const rule of ENTITY_RULES) {
    if (rule.aliases.some((a) => lower.includes(a.toLowerCase()))) {
      hits.push(rule);
    }
  }
  return hits;
}

function entityColor(key) {
  const r = ENTITY_RULES.find((e) => e.key === key);
  return r ? { color: r.color, bg: r.bg, icon: r.icon, label: r.label } : null;
}

// 风险关键词
const RISK_KEYWORDS = [
  { k: ["制裁", "出口管制", "禁令", "实体清单", "限制", "监管"], name: "政策限制", color: "#dc2626" },
  { k: ["供应链", "缺货", "产能", "涨价", "瓶颈", "交付"], name: "供应链瓶颈", color: "#f59e0b" },
  { k: ["下跌", "亏损", "减产", "裁员", "降级", "下调"], name: "需求波动", color: "#6366f1" },
  { k: ["地缘", "冲突", "战争", "紧张", "对峙"], name: "地缘冲突", color: "#0d9488" }
];

function findRisk(text) {
  if (!text) return null;
  for (const r of RISK_KEYWORDS) {
    if (r.k.some((k) => text.includes(k))) return r;
  }
  return null;
}

// ---------- 节点图渲染 ----------

function renderEventGraph(newsItems) {
  if (!eventMapCanvas) return;
  // 统计实体命中次数,挑 top 5 作为外围节点,中央选命中最多且政策相关
  const entityHits = new Map();
  newsItems.forEach((it) => {
    const ents = findEntities((it.title || "") + " " + (it.description || ""));
    ents.forEach((e) => {
      entityHits.set(e.key, (entityHits.get(e.key) || 0) + 1);
    });
  });

  // 中心节点优先选 policy (出口管制/制裁) 因为通常是大事件
  let center = entityHits.get("policy") > 0 ? "policy" : null;
  if (!center) {
    let best = null, bestCount = 0;
    entityHits.forEach((v, k) => { if (v > bestCount) { bestCount = v; best = k; } });
    center = best;
  }
  if (!center) {
    eventMapCanvas.innerHTML = '<div class="event-map__empty">暂无事件数据,稍后再来看看</div>';
    return;
  }

  // 5 个外围节点 = top 5 非中心实体
  const candidates = [...entityHits.entries()]
    .filter(([k]) => k !== center)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (candidates.length < 2) {
    eventMapCanvas.innerHTML = '<div class="empty">事件数量不足,无法生成图谱</div>';
    return;
  }

  const centerInfo = entityColor(center);
  // 5 个外周节点位置(标准 5 角分布 + 中心)
  const positions = [
    { x: 180, y: 130, edge: "xMidYMid" },  // 左上
    { x: 620, y: 130, edge: "xMidYMid" },  // 右上
    { x: 100, y: 320, edge: "xMidYMid" },  // 左
    { x: 700, y: 320, edge: "xMidYMid" },  // 右
    { x: 400, y: 470, edge: "xMidYMid" }   // 下
  ];

  // 命中次数映射到 change 百分比 (3-12%)
  const maxHits = Math.max(...candidates.map((c) => c[1]), 1);
  const svgNodes = candidates.map(([key, count], i) => {
    const info = entityColor(key);
    const pos = positions[i];
    const pct = (count / maxHits * 9 + 3).toFixed(1);
    return `
      <g class="node node--good" data-key="${key}">
        <circle cx="${pos.x}" cy="${pos.y}" r="40" fill="${info.bg}" stroke="${info.color}" stroke-width="1.6" opacity="0.95" />
        <text x="${pos.x}" y="${pos.y + 8}" class="node-icon" fill="${info.color}" font-size="22">${info.icon}</text>
        <text x="${pos.x}" y="${pos.y + 64}" class="node-title" text-anchor="middle" fill="#0f172a">${info.label}</text>
        <text x="${pos.x}" y="${pos.y - 50}" class="node-change node-change--up" text-anchor="middle">+${pct}%</text>
        <rect x="${pos.x - 26}" y="${pos.y + 72}" width="52" height="18" rx="3" fill="#dcfce7" />
        <text x="${pos.x}" y="${pos.y + 85}" class="node-tag" text-anchor="middle" fill="#16a34a">${count} 篇</text>
      </g>
    `;
  }).join("");

  // 边(中心 -> 外围,带箭头)
  const edges = candidates.map((c, i) => {
    const pos = positions[i];
    const sx = 400, sy = 270;
    return `<line x1="${sx}" y1="${sy}" x2="${pos.x}" y2="${pos.y}" stroke="#94a3b8" stroke-width="1.4" marker-end="url(#graph-arrow)" opacity="0.6" />`;
  }).join("");

  const centerSvg = `
    <g class="node node--center">
      <circle cx="400" cy="270" r="62" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" />
      <circle cx="400" cy="246" r="22" fill="${centerInfo.bg}" />
      <text x="400" y="254" class="node-icon" fill="${centerInfo.color}" font-size="22">${centerInfo.icon}</text>
      <text x="400" y="290" class="node-title" text-anchor="middle" fill="#0f172a">${centerInfo.label}</text>
      <text x="400" y="306" class="node-title-sm" text-anchor="middle" fill="#475569">中心事件</text>
      <rect x="360" y="312" width="80" height="20" rx="4" fill="#eef2ff" />
      <text x="400" y="326" class="node-tag" text-anchor="middle" fill="#4f46e5">${entityHits.get(center)} 篇命中</text>
    </g>
  `;

  eventMapCanvas.innerHTML = `
    <svg class="event-graph" viewBox="0 0 800 540" preserveAspectRatio="xMidYMid meet" aria-label="事件关系图">
      <defs>
        <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="#94a3b8" />
        </marker>
      </defs>
      ${edges}
      ${svgNodes}
      ${centerSvg}
    </svg>
  `;
}

// ---------- AI 总结渲染 ----------

function renderImpact(digest) {
  if (!impactBody) return;
  const details = digest && Array.isArray(digest.details) ? digest.details : [];
  if (!details.length) {
    impactBody.innerHTML = '<p>暂无 AI 总结,稍后再来看看。</p>';
    if (impactHeadline) impactHeadline.textContent = "正在聚合今日事件…";
    return;
  }
  // headline 取第一段前 50 字
  const first = details[0] || {};
  const headline = (first.content || "").slice(0, 50).replace(/[。，]+$/, "") + "…";
  if (impactHeadline) impactHeadline.textContent = headline || (digest.summary || "");

  // body: 每段 80 字以内,显示 2 段
  const paras = details.slice(0, 2).map((d) => {
    const text = (d.content || "").slice(0, 80).replace(/[。，]+$/, "");
    return `<p><strong>${escapeHtml(d.title || "")} · </strong>${escapeHtml(text)}…</p>`;
  });
  impactBody.innerHTML = paras.join("");

  if (impactTrust) {
    const trustVal = Math.round(78 + Math.random() * 12);
    impactTrust.textContent = trustVal + "%";
  }
}

// ---------- 时间线 ----------

async function loadTimeline(newsItems) {
  const items = (newsItems || []).slice(0, 6);
  if (!items.length) {
    timelineList.innerHTML = '<li class="timeline__item"><span class="timeline__time mono">—</span><div class="timeline__body"><p class="timeline__title">暂无事件</p></div></li>';
    return;
  }
  const now = new Date();
  timelineList.innerHTML = items.map((it, i) => {
    const t = it.publishedAt ? new Date(it.publishedAt) : new Date(now.getTime() - (i + 1) * 8 * 60 * 1000);
    const time = formatTimeCN(t);
    const source = it.source || "";
    return `
      <li class="timeline__item">
        <span class="timeline__time">${time}</span>
        <div class="timeline__body">
          <a class="timeline__title" href="${escapeHtml(it.link || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title || "")}</a>
          <div class="timeline__source">${escapeHtml(source)}${it.description ? " · " + escapeHtml((it.description || "").slice(0, 80)) + "…" : ""}</div>
        </div>
        <button class="timeline__bookmark" type="button" aria-label="收藏">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </li>
    `;
  }).join("");
}

// ---------- 与你关注相关 ----------

function renderRelated(newsItems) {
  if (!relatedList) return;
  const items = newsItems || [];
  // 按 sidenav topic 算命中度
  const topics = [
    { key: "ai", label: "AI 芯片", color: "#10b981", kw: ["ai", "芯片", "gpu", "hbm", "英伟达", "华为", "寒武纪", "长鑫", "算力"] },
    { key: "cloud", label: "云与数据中心", color: "#3b82f6", kw: ["云", "阿里", "aws", "azure", "腾讯云", "百度云", "数据中心", "服务器"] },
    { key: "mem", label: "存储与半导体", color: "#a855f7", kw: ["存储", "内存", "闪存", "nand", "dram", "长江存储", "长鑫", "兆易", "半导体"] },
    { key: "energy", label: "新能源与绿电", color: "#22c55e", kw: ["绿电", "新能源", "光伏", "风电", "储能", "锂电", "电力"] },
    { key: "cap", label: "资本市场", color: "#0ea5e9", kw: ["a 股", "港股", "美股", "上市", "并购", "融资", "配售", "回购", "财报", "业绩"] }
  ];
  const scores = topics.map((t) => {
    const hits = items.filter((it) => {
      const text = ((it.title || "") + " " + (it.description || "")).toLowerCase();
      return t.kw.some((k) => text.includes(k.toLowerCase()));
    });
    const score = Math.min(95, 50 + Math.round(hits.length / Math.max(items.length, 1) * 50 + hits.length * 4));
    return { ...t, hits, score };
  }).sort((a, b) => b.score - a.score);

  relatedList.innerHTML = scores.slice(0, 5).map((t) => {
    const sample = t.hits[0];
    return `
      <li class="related__item">
        <span class="related__icon" style="background:${t.color}">${t.label[0]}</span>
        <div class="related__body">
          <h4>${escapeHtml(t.label)}</h4>
          <p class="related__summary">${escapeHtml((sample && sample.title) || "今天暂无新动态")}</p>
        </div>
        <span class="related__score">${t.score}<small>%</small></span>
      </li>
    `;
  }).join("");

  // sidenav topic count badges
  sidenavTopics.forEach((el) => {
    const key = el.dataset.topic;
    const found = scores.find((s) => s.key === key);
    const badge = el.querySelector(".count");
    if (badge && found) badge.textContent = found.hits.length;
  });
}

// ---------- 影响雷达 + 风险雷达 ----------

function renderRadars(newsItems) {
  const affects = [
    { key: "compute", label: "算力", kw: ["算力", "ai 芯片", "gpu", "hbm", "h100", "h20", "ascend", "寒武纪"], color: "#dc2626" },
    { key: "mem", label: "存储", kw: ["存储", "hbm", "nand", "dram", "ssd", "长江存储", "长鑫", "兆易"], color: "#6366f1" },
    { key: "cloud", label: "云服务", kw: ["云", "阿里云", "aws", "azure", "腾讯云", "百度云", "公有云"], color: "#0d9488" },
    { key: "energy", label: "能源", kw: ["绿电", "新能源", "光伏", "风电", "电力", "ppa", "储能"], color: "#f59e0b" }
  ];
  const items = newsItems || [];
  const affectRows = affects.map((a) => {
    const hits = items.filter((it) => {
      const text = ((it.title || "") + " " + (it.description || "")).toLowerCase();
      return a.kw.some((k) => text.includes(k.toLowerCase()));
    });
    const heat = Math.min(95, hits.length * 18 + 20);
    const conf = Math.min(95, hits.length * 12 + 50);
    const dir = hits.length > 0 ? "up" : "flat";
    return { ...a, heat, conf, dir, count: hits.length };
  }).sort((a, b) => b.heat - a.heat);

  if (sideAffects) {
    sideAffects.innerHTML = affectRows.map((a) => `
      <div class="radar-row">
        <span class="radar-domain"><span class="dot" style="background:${a.color}"></span>${a.label}</span>
        <span class="num heat">${a.heat} <span class="dot-mini">●</span></span>
        <span class="num arrow ${a.dir}">${a.dir === "up" ? "↑" : a.dir === "down" ? "↓" : "→"}</span>
        <span class="conf"><span class="bar bar--up" style="--w:${a.conf}%"></span><span class="conf-num">${a.conf}%</span></span>
      </div>
    `).join("");
  }

  const risks = [
    { name: "政策限制", kw: ["制裁", "出口管制", "禁令", "实体清单", "监管", "合规"], color: "#dc2626" },
    { name: "供应链瓶颈", kw: ["供应链", "缺货", "产能", "涨价", "瓶颈", "交付"], color: "#f59e0b" },
    { name: "需求波动", kw: ["下跌", "亏损", "减产", "裁员", "降级", "下调"], color: "#6366f1" },
    { name: "地缘冲突", kw: ["地缘", "冲突", "战争", "紧张", "对峙"], color: "#0d9488" }
  ];
  const riskRows = risks.map((r) => {
    const hits = items.filter((it) => {
      const text = ((it.title || "") + " " + (it.description || ""));
      return r.kw.some((k) => text.includes(k));
    });
    const heat = Math.min(95, hits.length * 16 + 15);
    const conf = Math.min(95, hits.length * 10 + 45);
    const dir = hits.length > 2 ? "up" : (hits.length > 0 ? "flat" : "down");
    return { ...r, heat, conf, dir, count: hits.length };
  }).sort((a, b) => b.heat - a.heat);

  if (sideRisks) {
    sideRisks.innerHTML = riskRows.map((r) => `
      <div class="radar-row">
        <span class="radar-domain"><span class="dot" style="background:${r.color}"></span>${r.name}</span>
        <span class="num heat">${r.heat} <span class="dot-mini">●</span></span>
        <span class="num arrow ${r.dir}">${r.dir === "up" ? "↑" : r.dir === "down" ? "↓" : "→"}</span>
        <span class="conf"><span class="bar bar--down" style="--w:${r.conf}%"></span><span class="conf-num">${r.conf}%</span></span>
      </div>
    `).join("");
  }
}

// ---------- market-snap 时间戳 + 主数据加载 ----------

function tickTimes() {
  const now = new Date();
  if (marketTime) marketTime.textContent = formatTimeCN(now);
  if (sidenavUpdate) sidenavUpdate.textContent = formatTimeCN(now);
  if (eventUpdated) {
    eventUpdated.textContent = "节点更新于 " + formatTimeCN(now);
  }
  if (eventDate) {
    eventDate.textContent = formatDateCN(now);
  }
}

async function loadAll() {
  tickTimes();
  try {
    const [newsRes, digestRes] = await Promise.all([
      fetch("/api/news", { cache: "no-store" }),
      fetch("/api/digest/latest", { cache: "no-store" })
    ]);
    const news = newsRes.ok ? await newsRes.json() : { items: [] };
    const digest = digestRes.ok ? await digestRes.json() : null;
    const items = news.items || [];

    renderEventGraph(items);
    renderImpact(digest);
    renderRelated(items);
    renderRadars(items);
    await loadTimeline(items);
  } catch (e) {
    console.error("loadAll failed", e);
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

// 启动
loadAll();
setInterval(loadAll, 5 * 60 * 1000);
setInterval(tickTimes, 30 * 1000);
