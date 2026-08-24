// Signal Board · 编辑部智能晨报
// 全量从 /api/news + /api/digest/latest 实时渲染,无 hardcoded mock

const $ = (id) => document.getElementById(id);

const heroDate = $("hero-date");
const heroWeekday = $("hero-weekday");
const heroTitle = $("hero-title");
const heroLede = $("hero-lede");
const heroImg = $("hero-img");
const heroCta = $("hero-cta");

const briefingList = $("briefing-list");
const picksList = $("picks-list");
const signalsList = $("signals-list");
const tabLatest = document.querySelector('.editorial__tabs .tab[data-tab="latest"]');
const tabDeep = document.querySelector('.editorial__tabs .tab[data-tab="deep"]');

const sentimentFill = $("sentiment-fill");
const sentimentMarker = $("sentiment-marker");
const sentimentLabel = $("sentiment-label");
const sentimentNum = $("sentiment-num");
const sentimentDelta = $("sentiment-delta");

const userBtn = $("user-btn");
const userAvatar = $("user-avatar");
const userLabel = $("user-label");
const userPopover = $("user-popover");
const topSearchInput = document.querySelector(".topbar__search input");
const collectBtn = document.querySelector('.topbar__btn[aria-label="收藏"]');

const fab = $("chat-fab");
const modal = $("chat-modal");
const closeBtn = $("chat-close");
const clearBtn = $("chat-clear");
const chatForm = $("chat-form");
const chatInput = $("chat-input");
const chatSend = $("chat-send");
const chatStream = $("chat-stream");
const suggestList = $("suggest-list");
const toastStack = $("toast-stack");

const AI_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 4 7v10l8 5 8-5V7l-8-5z"/><path d="M12 22V12"/><path d="m4 7 8 5 8-5"/></svg>`;
const USER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"/></svg>`;

let conversationHistory = [];

// 应用状态
const state = {
  news: [],
  digest: null,
  user: null,
  providers: [],
  activeNav: "all",     // 顶栏主导航:active category
  activeTab: "latest",  // 编辑精选 tab
  searchQuery: "",      // 搜索框
  collected: loadSet("sb.collected"),  // 收藏的 news id
  followTopics: loadSet("sb.follow") || new Set(["ai", "cloud", "mem", "energy", "cap"]),
  currentView: "news"   // 当前 picks 视图(最新 / 深度)
};

function loadSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (_) { return new Set(); }
}
function saveSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch (_) {}
}

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
  const chars = (text.match(/[一-鿿]/g) || []).length;
  return Math.max(2, Math.min(15, Math.round(chars / 300) || 4));
}

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

// 顶栏主导航的 category 关键词
const NAV_CAT = {
  all: null,
  ai: /(ai|大模型|llm|gpt|hbm|算力|训练|推理|智能体|英伟达|寒武纪|长鑫|阿里|华为)/i,
  tech: /(芯片|半导体|台积|smic|代工|晶圆|科技|手机|windows|苹果|特斯拉|电动车|机器人)/i,
  market: /(a 股|港股|美股|创业板|科创|恒生|纳斯达克|标普|道琼斯|涨|跌|市值|融资|配售|ipo|财报|业绩|资本|市场|经济|美元|人民币|外汇|债券)/i,
  policy: /(制裁|出口|许可|实体清单|监管|政策|国务院|发改委|央行|美联储|商务部|外交部|拜登|特朗普)/i,
  industry: /(行业|产业|制造业|工厂|供应链|物流|航运|航空|零售|消费|汽车|化工|能源|电力)/i
};

function matchNav(text, nav) {
  const re = NAV_CAT[nav];
  if (!re) return true;
  return re.test(text);
}

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

function makeSub(desc) {
  if (!desc) return "";
  const cleaned = desc.replace(/<[^>]+>/g, "").trim();
  const m = cleaned.split(/[。!?]/);
  return (m[0] || cleaned).slice(0, 60).trim();
}

function shortSource(url, sourceName) {
  if (sourceName) return sourceName;
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
  } catch (_) { return "资讯"; }
}

function newsId(item) {
  // 用 link 末段做 id,fallback 到 title
  try { return (item.link || "").split("/").filter(Boolean).slice(-2).join("/") || (item.title || "").slice(0, 30); }
  catch (_) { return (item.title || "").slice(0, 30); }
}

const HERO_FALLBACK_GRADIENT = "linear-gradient(135deg, #0a0e1a 0%, #1a2236 45%, #2a3556 100%)";

// ---------- Toast ----------

function toast(msg, type = "info", ms = 2400) {
  if (!toastStack) return;
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  toastStack.appendChild(el);
  setTimeout(() => {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 220);
  }, ms);
}

// ---------- Auth ----------

async function loadAuth() {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    state.user = data.user || null;
    state.providers = data.providers || [];
    renderUser();
  } catch (_) { /* ignore */ }
}

function renderUser() {
  if (!userBtn) return;
  const u = state.user;
  if (u) {
    userBtn.dataset.loggedIn = "true";
    if (u.avatar) {
      userAvatar.innerHTML = `<img src="${escapeHtml(u.avatar)}" alt="" />`;
    } else {
      userAvatar.textContent = (u.name || u.login || "U").slice(0, 1);
    }
    userLabel.textContent = u.name || u.login || "已登录";
  } else {
    userBtn.dataset.loggedIn = "false";
    userAvatar.textContent = "登";
    userLabel.textContent = "登录";
  }
}

function renderPopover() {
  if (!userPopover) return;
  const u = state.user;
  if (u) {
    const providerIcon = u.provider === "github"
      ? `<div class="user-popover__provider-icon user-popover__provider-icon--github">GH</div>`
      : `<div class="user-popover__provider-icon user-popover__provider-icon--google">G</div>`;
    userPopover.innerHTML = `
      <div class="user-popover__head">
        <div class="topbar__avatar">${u.avatar ? `<img src="${escapeHtml(u.avatar)}" alt="" />` : escapeHtml((u.name || u.login || "U").slice(0, 1))}</div>
        <div>
          <div class="user-popover__name">${escapeHtml(u.name || u.login || "已登录")}<span class="user-popover__provider">${u.provider || ""}</span></div>
          <div class="user-popover__sub">${escapeHtml(u.login || "")}</div>
        </div>
      </div>
      ${u.profile ? `<a class="user-popover__btn" href="${escapeHtml(u.profile)}" target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
        查看个人主页
      </a>` : ""}
      <a class="user-popover__btn user-popover__btn--danger" href="/api/auth/logout">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        退出登录
      </a>
    `;
  } else {
    const hasGithub = state.providers.includes("github");
    const hasGoogle = state.providers.includes("google");
    const buttons = [];
    if (hasGithub) buttons.push(`<a class="user-popover__btn" href="/api/auth/github">
      <div class="user-popover__provider-icon user-popover__provider-icon--github">GH</div>
      <span>使用 GitHub 登录</span>
    </a>`);
    if (hasGoogle) buttons.push(`<a class="user-popover__btn" href="/api/auth/google">
      <div class="user-popover__provider-icon user-popover__provider-icon--google">G</div>
      <span>使用 Google 登录</span>
    </a>`);
    if (!buttons.length) {
      userPopover.innerHTML = `<div class="user-popover__empty">暂未配置登录通道。请联系管理员在 GitHub Secrets 中添加 <code>GITHUB_CLIENT_ID</code> / <code>GITHUB_CLIENT_SECRET</code>。</div>`;
    } else {
      userPopover.innerHTML = `
        <div class="user-popover__empty" style="border-bottom:1px solid var(--border); padding-bottom:.6rem; margin-bottom:.4rem;">登录后可订阅简报、收藏文章、跨设备同步关注主题。</div>
        ${buttons.join("")}
      `;
    }
  }
}

if (userBtn) {
  userBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (userPopover.classList.contains("is-open")) {
      userPopover.classList.remove("is-open");
      userBtn.setAttribute("aria-expanded", "false");
    } else {
      renderPopover();
      userPopover.classList.add("is-open");
      userBtn.setAttribute("aria-expanded", "true");
    }
  });
  document.addEventListener("click", (e) => {
    if (userPopover.classList.contains("is-open") && !userPopover.contains(e.target) && e.target !== userBtn && !userBtn.contains(e.target)) {
      userPopover.classList.remove("is-open");
      userBtn.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && userPopover.classList.contains("is-open")) {
      userPopover.classList.remove("is-open");
      userBtn.setAttribute("aria-expanded", "false");
    }
  });
}

// ---------- Hero ----------

function renderHero(newsItems, digest) {
  const now = new Date();
  if (heroDate) heroDate.textContent = formatDateCN(now);
  if (heroWeekday) heroWeekday.textContent = WEEKDAYS[now.getDay()];

  // hero 标题:从 digest.summary 提炼
  let heroTitleText = "";
  if (digest && digest.summary) {
    const m = digest.summary.match(/^[^。，,]+/);
    heroTitleText = m ? m[0] : digest.summary.slice(0, 24);
  }
  if (!heroTitleText) {
    const allItems = (newsItems || []);
    heroTitleText = (allItems[0] && allItems[0].title) || (digest && digest.title) || "今日 AI 与市场要闻";
  }
  if (heroTitleText.length > 24) heroTitleText = heroTitleText.slice(0, 23) + "…";
  if (heroTitle) heroTitle.textContent = heroTitleText;

  if (heroLede && digest && digest.summary) {
    heroLede.textContent = digest.summary;
  } else if (heroLede && newsItems && newsItems[0] && newsItems[0].description) {
    heroLede.textContent = (newsItems[0].description || "").replace(/<[^>]+>/g, "").slice(0, 120);
  }

  const top = (newsItems && newsItems[0]) || null;
  if (heroImg && top && top.image) {
    heroImg.style.backgroundImage = `url('${top.image}'), ${HERO_FALLBACK_GRADIENT}`;
    heroImg.style.backgroundSize = "cover";
    heroImg.style.backgroundPosition = "center";
  } else if (heroImg) {
    heroImg.style.backgroundImage = HERO_FALLBACK_GRADIENT;
  }
  const creditEl = heroImg && heroImg.querySelector(".hero__img-credit");
  const sourceEl = heroImg && heroImg.querySelector(".hero__img-source");
  if (creditEl) creditEl.textContent = "图 · " + (top ? shortSource(top.link, top.source) + " · 配图" : "视觉中国");
  if (sourceEl) sourceEl.textContent = "来源 · " + (top && top.source ? top.source : "编辑部综合");
}

// CTA:生成今日简报 → 复制 + 弹 toast
if (heroCta) {
  heroCta.addEventListener("click", async (e) => {
    e.preventDefault();
    const d = state.digest;
    if (!d) { toast("简报尚未加载,请稍后再试", "error"); return; }
    const lines = [];
    lines.push(`【${d.title || "AI 与市场晨报"}】${d.digestDate || ""}`);
    lines.push(`市场情绪:${d.marketSentiment || "—"}   AI 情绪:${d.aiSentiment || "—"}`);
    if (d.summary) lines.push("", d.summary);
    if (Array.isArray(d.details)) {
      d.details.forEach((seg) => {
        if (seg.title || seg.content) {
          lines.push("", `— ${seg.title || ""} —`);
          if (seg.content) lines.push(seg.content);
        }
      });
    }
    const text = lines.join("\n");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        toast("今日简报已复制到剪贴板", "success");
      } else {
        // fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast("已复制到剪贴板", "success");
      }
    } catch (err) {
      toast("复制失败,请检查浏览器权限", "error");
    }
  });
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
    const time = `${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
    const tagKeys = inferTags((it.title || "") + " " + (it.description || ""));
    const tag = TAG_LABEL[tagKeys[0]] || TAG_LABEL.ai;
    const desc = (it.description || "").replace(/<[^>]+>/g, "").slice(0, 90);
    return `
      <li class="pick briefing__item" data-href="${escapeHtml(it.link || "#")}">
        <span class="briefing__time">${time}</span>
        <div class="briefing__dot"></div>
        <div class="briefing__body">
          <span class="${tag.cls}">${tag.text}</span>
          <h3 class="briefing__item-title">${escapeHtml(it.title || "")}</h3>
          <p class="briefing__desc">${escapeHtml(desc)}</p>
          <a class="briefing__more" href="${escapeHtml(it.link || "#")}" target="_blank" rel="noopener noreferrer" data-stop="1">查看完整解读 →</a>
        </div>
      </li>
    `;
  }).join("");
  // 整张卡片可点击(但 more 链接自己阻止冒泡)
  briefingList.querySelectorAll(".briefing__item").forEach((li) => {
    li.addEventListener("click", (e) => {
      if (e.target.closest("[data-stop]")) return;
      const href = li.dataset.href;
      if (href && href !== "#") window.open(href, "_blank", "noopener,noreferrer");
    });
    li.style.cursor = "pointer";
  });
}

// ---------- 编辑精选 ----------

function getDisplayedPicks() {
  const all = state.news || [];
  const q = (state.searchQuery || "").trim().toLowerCase();
  const nav = state.activeNav;
  let list = all.filter((it) => {
    const text = (it.title || "") + " " + (it.description || "");
    if (!matchNav(text, nav)) return false;
    if (q) {
      if (!text.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  // 跳过前 3 个(briefing 用过)
  if (state.activeNav === "all" && !q) {
    list = list.slice(3, 7);
  } else {
    list = list.slice(0, 6);
  }
  return list;
}

function getDeepPicks() {
  // 深度视图:从 digest.details 拆段展示
  const d = state.digest;
  if (!d || !Array.isArray(d.details) || !d.details.length) return [];
  return d.details.map((seg, i) => ({
    id: "deep-" + i,
    title: seg.title || "深度解读",
    description: seg.content || "",
    source: "编辑部",
    publishedAt: d._generatedAt || new Date().toISOString(),
    isDeep: true,
    deepIndex: i
  }));
}

function renderPicks() {
  if (!picksList) return;
  const list = state.activeTab === "deep" ? getDeepPicks() : getDisplayedPicks();
  if (!list.length) {
    const empty = state.activeTab === "deep" ? "暂无深度解读" :
      (state.searchQuery ? "没找到匹配的新闻" : "暂无新闻");
    picksList.innerHTML = `<li class="pick pick--loading">${empty}</li>`;
    return;
  }
  if (state.activeTab === "deep") {
    picksList.innerHTML = list.map((it) => `
      <li class="pick pick--deep" data-deep="${it.deepIndex}">
        <div class="pick__cover pick__cover--placeholder" aria-hidden="true">D${it.deepIndex + 1}</div>
        <div class="pick__body">
          <div class="pick__tags">
            <span class="pick__tag pick__tag--lead">深度</span>
            <span class="pick__tag pick__tag--ai">AI 分析</span>
          </div>
          <h3 class="pick__title">${escapeHtml(it.title)}</h3>
          <p class="pick__desc">${escapeHtml((it.description || "").slice(0, 220))}${(it.description || "").length > 220 ? "…" : ""}</p>
          <p class="pick__meta">
            <span class="pick__source">编辑部</span>
            <span>·</span>
            <span class="pick__read">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              ${estimateReadMinutes(it.description)} 分钟
            </span>
          </p>
        </div>
      </li>
    `).join("");
    return;
  }
  picksList.innerHTML = list.map((it) => {
    const id = newsId(it);
    const isCollected = state.collected.has(id);
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
    const src = shortSource(it.link, it.source);
    const hashTags = inferHashTags((it.title || "") + " " + (it.description || ""));
    const hashHtml = hashTags.map((h) => `<a href="#" data-stop="1" data-tag="${escapeHtml(h.label)}"># ${escapeHtml(h.label)}</a>`).join(" ");
    const coverHtml = it.image
      ? `<a class="pick__cover-wrap" href="${escapeHtml(it.link || "#")}" target="_blank" rel="noopener noreferrer" data-stop="1"><div class="pick__cover"><img src="${escapeHtml(it.image)}" alt="" loading="lazy" /></div></a>`
      : `<a class="pick__cover-wrap" href="${escapeHtml(it.link || "#")}" target="_blank" rel="noopener noreferrer" data-stop="1"><div class="pick__cover pick__cover--placeholder">${escapeHtml((it.title || "?").slice(0, 1))}</div></a>`;
    return `
      <li class="pick" data-id="${escapeHtml(id)}" data-link="${escapeHtml(it.link || "#")}">
        ${coverHtml}
        <div class="pick__body">
          <div class="pick__tags">${leadTag}${tagsHtml}<button class="pick__collect ${isCollected ? "is-on" : ""}" type="button" data-stop="1" data-collect="${escapeHtml(id)}" aria-label="收藏" title="${isCollected ? "已收藏" : "收藏"}">
            <svg viewBox="0 0 24 24" fill="${isCollected ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.6"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </button></div>
          <h3 class="pick__title"><a href="${escapeHtml(it.link || "#")}" target="_blank" rel="noopener noreferrer" data-stop="1">${escapeHtml(it.title || "")}</a></h3>
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

  // 委托:收藏按钮 / hash 点击 / 卡片本身(点空白处)跳链
  picksList.querySelectorAll(".pick").forEach((li) => {
    const id = li.dataset.id;
    const link = li.dataset.link;
    li.style.cursor = "pointer";
    li.addEventListener("click", (e) => {
      const t = e.target.closest("[data-stop]");
      if (t) {
        e.preventDefault();
        if (t.dataset.collect) toggleCollect(t.dataset.collect, t);
        else if (t.dataset.tag) {
          // hash tag → 当作搜索
          state.searchQuery = t.dataset.tag;
          if (topSearchInput) topSearchInput.value = t.dataset.tag;
          state.activeTab = "latest";
          setActiveTab("latest");
          renderPicks();
          toast("已按 #" + t.dataset.tag + " 过滤", "info");
        }
        return;
      }
      if (link && link !== "#") window.open(link, "_blank", "noopener,noreferrer");
    });
  });
}

function toggleCollect(id, btn) {
  if (state.collected.has(id)) {
    state.collected.delete(id);
    if (btn) btn.classList.remove("is-on");
    if (btn) btn.setAttribute("title", "收藏");
    toast("已取消收藏", "info");
  } else {
    state.collected.add(id);
    if (btn) btn.classList.add("is-on");
    if (btn) btn.setAttribute("title", "已收藏");
    toast("已收藏", "success");
  }
  saveSet("sb.collected", state.collected);
}

// ---------- 待验证信号 ----------

function renderSignals(digest) {
  if (!signalsList) return;
  const items = [];
  if (digest && Array.isArray(digest.marketItems) && digest.marketItems[0]) {
    items.push({ title: "半导体涨价潮延续", hint: digest.marketItems[0].slice(0, 80) });
  }
  if (digest && Array.isArray(digest.aiItems) && digest.aiItems[0]) {
    items.push({ title: "AI 资本开支创历史新高", hint: digest.aiItems[0].slice(0, 80) });
  }
  if (digest && Array.isArray(digest.aiItems) && digest.aiItems[1]) {
    items.push({ title: "国产替代节奏验证", hint: digest.aiItems[1].slice(0, 80) });
  }
  while (items.length < 3) items.push({ title: "关注今日剩余事件", hint: "待聚合…" });
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
    const delta = (m.value || 0) - 65;
    sentimentDelta.textContent = (delta >= 0 ? "+" : "") + delta;
    sentimentDelta.className = delta >= 0 ? "up" : "down";
  }
}

// ---------- 主导航 filter ----------

function setActiveNav(key) {
  state.activeNav = key;
  document.querySelectorAll(".topbar__item").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.nav === key);
  });
  // 切到 latest 视图(避免 deep 视图 + nav filter 冲突)
  state.activeTab = "latest";
  setActiveTab("latest");
  renderPicks();
  toast("已切换:" + (NAV_LABELS[key] || key), "info");
}

const NAV_LABELS = { all: "全部", ai: "AI", tech: "科技", market: "市场", policy: "政策", industry: "行业" };

document.querySelectorAll(".topbar__item").forEach((el) => {
  const key = el.dataset.nav;
  if (key) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      if (key === "industry") {
        toast("行业页面建设中", "info");
        return;
      }
      setActiveNav(key);
    });
  }
});

// ---------- 编辑精选 tab ----------

function setActiveTab(key) {
  state.activeTab = key;
  if (tabLatest && tabDeep) {
    tabLatest.classList.toggle("is-active", key === "latest");
    tabDeep.classList.toggle("is-active", key === "deep");
  }
}

if (tabLatest) tabLatest.addEventListener("click", () => { setActiveTab("latest"); renderPicks(); });
if (tabDeep) tabDeep.addEventListener("click", () => {
  if (!state.digest || !state.digest.details || !state.digest.details.length) {
    toast("暂无深度解读", "info");
    return;
  }
  setActiveTab("deep");
  renderPicks();
});

// ---------- 搜索 ----------

if (topSearchInput) {
  let timer = null;
  topSearchInput.addEventListener("input", (e) => {
    const v = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.searchQuery = v;
      if (v && state.activeTab !== "latest") setActiveTab("latest");
      renderPicks();
    }, 180);
  });
  topSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      state.searchQuery = topSearchInput.value;
      setActiveTab("latest");
      renderPicks();
      if (state.searchQuery) toast("搜索:" + state.searchQuery, "info", 1600);
    } else if (e.key === "Escape") {
      topSearchInput.value = "";
      state.searchQuery = "";
      renderPicks();
    }
  });
}

// ---------- 收藏顶栏 button ----------

if (collectBtn) {
  collectBtn.addEventListener("click", () => {
    // 收藏当前页:把当前 hero + digest 打包存
    const payload = {
      date: new Date().toISOString(),
      title: heroTitle ? heroTitle.textContent : "",
      summary: heroLede ? heroLede.textContent : ""
    };
    let collections = loadSet("sb.pageFav");
    // 用 boolean 标记(单一收藏"当前页")
    collections = new Set([JSON.stringify(payload)]);
    saveSet("sb.pageFav", collections);
    collectBtn.classList.add("is-on");
    if (!document.getElementById("collect-style")) {
      const s = document.createElement("style");
      s.id = "collect-style";
      s.textContent = `.topbar__btn.is-on svg path { fill: currentColor; }`;
      document.head.appendChild(s);
    }
    toast("已收藏今日简报到本地", "success");
  });
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
    state.news = news.items || [];
    state.digest = digest;
    renderHero(state.news, state.digest);
    renderBriefing(state.news);
    renderPicks();
    renderSignals(state.digest);
    renderSentiment(state.digest);
  } catch (e) {
    console.error("loadAll failed", e);
    toast("加载失败:" + e.message, "error", 4000);
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

// 启动
loadAuth();
loadAll();
setInterval(loadAll, 5 * 60 * 1000);
