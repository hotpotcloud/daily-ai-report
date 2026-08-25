import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useToast } from "../components/ToastHost.jsx";
import PickCard from "../components/PickCard.jsx";
import { pad2, formatDateCN, WEEKDAYS, timeAgo, shortSource, inferTags, TAG_LABEL, inferHashTags, newsId } from "../lib/text.js";

const HERO_FALLBACK = "linear-gradient(135deg, #0a0e1a 0%, #1a2236 45%, #2a3556 100%)";

export default function HomePage() {
  const [news, setNews] = useState({ items: [] });
  const [digest, setDigest] = useState(null);
  const [topics, setTopics] = useState([]);
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const q = params.get("q") || "";
  const nav = params.get("nav") || "all";

  useEffect(() => {
    Promise.all([api.news(), api.digest().catch(() => null), api.topics().catch(() => ({ topics: [] }))])
      .then(([n, d, t]) => {
        setNews(n || { items: [] });
        setDigest(d);
        setTopics(t?.topics || []);
      })
      .catch((e) => toast.push("加载失败:" + e.message, "error", 4000));
  }, []);

  const allItems = news.items || [];
  const navFiltered = (() => {
    if (nav === "all") return allItems;
    const re = NAV_RE[nav];
    if (!re) return allItems;
    return allItems.filter((it) => re.test((it.title || "") + " " + (it.description || "")));
  })();
  const searchFiltered = q ? navFiltered.filter((it) => ((it.title || "") + " " + (it.description || "")).toLowerCase().includes(q.toLowerCase())) : navFiltered;
  // 当 nav=all 且无 q,跳过前 3 个(已经在 briefing)
  const pickList = (nav === "all" && !q) ? searchFiltered.slice(3, 7) : searchFiltered.slice(0, 6);

  const top = allItems[0];
  const heroTitle = (() => {
    if (digest && digest.summary) {
      const m = digest.summary.match(/^[^。，,]+/);
      if (m) return m[0].slice(0, 24);
    }
    return (top && top.title) || (digest && digest.title) || "今日 AI 与市场要闻";
  })();
  const heroTitleFinal = heroTitle.length > 24 ? heroTitle.slice(0, 23) + "…" : heroTitle;
  const briefingItems = allItems.slice(0, 3);
  const signals = (() => {
    const items = [];
    if (digest?.marketItems?.[0]) items.push({ title: "半导体涨价潮延续", hint: digest.marketItems[0].slice(0, 80) });
    if (digest?.aiItems?.[0]) items.push({ title: "AI 资本开支创历史新高", hint: digest.aiItems[0].slice(0, 80) });
    if (digest?.aiItems?.[1]) items.push({ title: "国产替代节奏验证", hint: digest.aiItems[1].slice(0, 80) });
    while (items.length < 3) items.push({ title: "关注今日剩余事件", hint: "待聚合…" });
    return items.slice(0, 3);
  })();

  return (
    <>
      <section className="hero" aria-label="今日头条">
        <div className="hero__text">
          <p className="hero__kicker mono"><span>{formatDateCN(new Date())}</span><span className="hero__dot">·</span><span>{WEEKDAYS[new Date().getDay()]}</span></p>
          <h1 className="hero__title">{heroTitleFinal}</h1>
          <p className="hero__lede">{digest?.summary || (top?.description || "").replace(/<[^>]+>/g, "").slice(0, 120) || ""}</p>
          <div className="hero__cta">
            <button className="btn btn--primary" type="button" onClick={() => copyBriefToClipboard(digest, toast)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              <span>生成今日简报</span>
            </button>
            <span className="hero__cta-hint">AI 为你生成结构化要点、因果链与观察清单</span>
          </div>
        </div>
        <figure className="hero__media">
          <div className="hero__img" style={{ backgroundImage: (top?.image ? `url('${top.image}'), ` : "") + HERO_FALLBACK, backgroundSize: "cover", backgroundPosition: "center" }}>
            <div className="hero__img-overlay">
              <span className="hero__img-credit">图 · {top ? shortSource(top.link, top.source) + " · 配图" : "视觉中国"}</span>
              <span className="hero__img-source">来源 · {top?.source || "编辑部综合"}</span>
            </div>
          </div>
        </figure>
      </section>

      <section className="briefing" aria-labelledby="briefing-title">
        <header className="briefing__head">
          <h2 className="section__title" id="briefing-title">5 分钟晨报</h2>
          <p className="briefing__sub">关键进展与 AI 因果</p>
        </header>
        <ol className="briefing__list">
          {briefingItems.length === 0 && <li className="briefing__item"><div className="briefing__body"><p className="briefing__desc">暂无事件</p></div></li>}
          {briefingItems.map((it, i) => {
            const t = it.publishedAt ? new Date(it.publishedAt) : new Date(Date.now() - (i + 1) * 35 * 60 * 1000);
            const time = `${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
            const tagKey = inferTags((it.title || "") + " " + (it.description || ""))[0] || "ai";
            const tag = TAG_LABEL[tagKey] || TAG_LABEL.ai;
            const desc = (it.description || "").replace(/<[^>]+>/g, "").slice(0, 90);
            return (
              <li className="briefing__item" key={i} onClick={(e) => { if (!e.target.closest("a")) it.link && window.open(it.link, "_blank", "noopener,noreferrer"); }} style={{ cursor: "pointer" }}>
                <span className="briefing__time">{time}</span>
                <div className="briefing__dot" />
                <div className="briefing__body">
                  <span className={tag.cls}>{tag.text}</span>
                  <h3 className="briefing__item-title">{it.title || ""}</h3>
                  <p className="briefing__desc">{desc}</p>
                  <a className="briefing__more" href={it.link || "#"} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>查看完整解读 →</a>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="editorial" aria-label="编辑精选与今日观察">
        <div className="editorial__main">
          <header className="editorial__head">
            <h2 className="section__title">编辑精选</h2>
            <div className="editorial__tabs" role="tablist">
              <button className="tab is-active" data-tab="latest" type="button">最新</button>
              <button className="tab" data-tab="deep" type="button" onClick={() => toast.push("深度解读见 /api/digest/latest 的 details 字段", "info")}>深度</button>
            </div>
          </header>
          <ol className="picks">
            {pickList.length === 0 ? <li className="pick pick--loading">{q ? "没找到匹配的新闻" : "暂无新闻"}</li> :
              pickList.map((it) => <PickCard key={newsId(it)} item={it} />)
            }
          </ol>
        </div>
        <aside className="watchlist" aria-label="今日观察清单">
          <header className="watchlist__head">
            <h2 className="section__title">今日观察清单</h2>
            <a className="watchlist__more" href="/archive">查看完整解读 →</a>
          </header>
          <h3 className="watchlist__group-title">待验证信号</h3>
          <ol className="signals">
            {signals.map((s, i) => (
              <li className="signal" key={i}>
                <span className="signal__num">{i + 1}</span>
                <div className="signal__body">
                  <h4 className="signal__title">{s.title}</h4>
                  <p className="signal__hint">{s.hint}</p>
                </div>
              </li>
            ))}
          </ol>
          <h3 className="watchlist__group-title watchlist__group-title--meta">
            <span>市场情绪</span>
            <span className="watchlist__sub mono">综合多源数据</span>
            <span className="watchlist__hint" title="综合 Wind、花旗、Social、新闻情绪模型">ⓘ</span>
          </h3>
          <SentimentBlock digest={digest} />
        </aside>
      </section>

      <section className="topics" aria-label="专题入口">
        <header className="topics__head">
          <h2 className="section__title">专题入口</h2>
          <a className="topics__more" href="/archive">更多专题 →</a>
        </header>
        <ol className="topics__list">
          {topics.length === 0 ? (
            <li>暂无专题</li>
          ) : topics.map((t) => (
            <li className="topic" key={t.slug}>
              <Link to={`/topic/${t.slug}`}>
                <div className="topic__cover" style={{ background: `linear-gradient(135deg, ${t.color} 0%, ${t.accent} 100%)` }} aria-hidden="true" />
                <div className="topic__body">
                  <h3 className="topic__title">{t.title}</h3>
                  <p className="topic__sub">{t.sub}</p>
                  <span className="topic__cta">查看专题 →</span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function SentimentBlock({ digest }) {
  if (!digest || !Array.isArray(digest.metrics)) return null;
  const m = digest.metrics.find((x) => x.label === "市场风险偏好") || digest.metrics[0];
  if (!m) return null;
  const v = Math.max(0, Math.min(100, m.value || 0));
  const delta = (m.value || 0) - 65;
  return (
    <div className="sentiment">
      <div className="sentiment__bar">
        <div className="sentiment__bar-marker" style={{ left: v + "%" }} />
      </div>
      <div className="sentiment__scale mono"><span>0 悲观</span><span>50 中性</span><span>100 乐观</span></div>
      <p className="sentiment__readout">
        <span className="sentiment__label">{m.trend || digest.marketSentiment || "中性"}</span>
        <span className="sentiment__score"><span className="sentiment__num">{v}</span><span className="sentiment__den">/100</span></span>
      </p>
      <p className="sentiment__delta mono">较昨日 <span className={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "+" : ""}{delta}</span></p>
      <p className="sentiment__source">数据来源:Wind · 花旗 · Social · 新闻情绪模型</p>
    </div>
  );
}

const NAV_RE = {
  ai: /(ai|大模型|llm|gpt|hbm|算力|训练|推理|智能体|英伟达|寒武纪|长鑫|阿里|华为)/i,
  tech: /(芯片|半导体|台积|smic|代工|晶圆|科技|手机|windows|苹果|特斯拉|电动车|机器人)/i,
  market: /(a 股|港股|美股|创业板|科创|恒生|纳斯达克|标普|道琼斯|涨|跌|市值|融资|配售|ipo|财报|业绩|资本|市场|经济|美元|人民币|外汇|债券)/i,
  policy: /(制裁|出口|许可|实体清单|监管|政策|国务院|发改委|央行|美联储|商务部|外交部|拜登|特朗普)/i,
  industry: /(行业|产业|制造业|工厂|供应链|物流|航运|航空|零售|消费|汽车|化工|能源|电力)/i
};

async function copyBriefToClipboard(digest, toast) {
  if (!digest) { toast.push("简报尚未加载", "error"); return; }
  const lines = [];
  lines.push(`【${digest.title || "AI 与市场晨报"}】${digest.digestDate || ""}`);
  lines.push(`市场情绪:${digest.marketSentiment || "—"}   AI 情绪:${digest.aiSentiment || "—"}`);
  if (digest.summary) lines.push("", digest.summary);
  if (Array.isArray(digest.details)) {
    digest.details.forEach((seg) => {
      if (seg.title || seg.content) {
        lines.push("", `— ${seg.title || ""} —`);
        if (seg.content) lines.push(seg.content);
      }
    });
  }
  const text = lines.join("\n");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast.push("已复制到剪贴板", "success");
  } catch (e) {
    toast.push("复制失败:" + e.message, "error");
  }
}
