import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useToast } from "../components/ToastHost.jsx";
import { inferTags, TAG_LABEL, timeAgo, shortSource, newsId } from "../lib/text.js";

export default function TopicPage() {
  const { slug } = useParams();
  const [topic, setTopic] = useState(null);
  const [digest, setDigest] = useState(null);
  const [items, setItems] = useState([]);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followed, setFollowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const toast = useToast();

  useEffect(() => {
    setTopic(null); setItems([]); setRelated([]); setLoading(true);
    (async () => {
      try {
        const [data, all, me] = await Promise.all([
          api.topic(slug),
          api.topics().catch(() => ({ topics: [] })),
          api.followList().catch(() => ({ followed: [] }))
        ]);
        if (!data.topic) {
          setTopic({ title: "专题不存在", sub: `slug = ${slug}` });
          return;
        }
        setTopic(data.topic);
        setDigest(data.digest);
        setItems(data.items || []);
        setRelated((all.topics || []).filter((t) => t.slug !== slug));
        setFollowed((me.followed || []).includes(slug));
      } catch (e) {
        setTopic({ title: "加载失败", sub: e.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const toggleFollow = async () => {
    if (!user) { toast.push("请先登录", "error"); return; }
    if (busy) return;
    setBusy(true);
    try {
      if (followed) {
        const d = await api.followRemove(slug);
        setFollowed(false);
        toast.push("已取消关注", "info");
      } else {
        const d = await api.followAdd(slug);
        setFollowed(true);
        toast.push("已关注", "success");
      }
    } catch (e) {
      toast.push("操作失败:" + e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (topic && topic.color) {
      document.documentElement.style.setProperty("--topic-accent", topic.color);
    }
  }, [topic]);

  if (loading && !topic) {
    return (
      <section className="topic-hero">
        <p className="page-head__kicker mono">TOPIC / 专题</p>
        <h1 className="topic-hero__title">正在加载…</h1>
      </section>
    );
  }

  if (topic && (!items.length && topic.title === "专题不存在")) {
    return (
      <section className="topic-hero">
        <p className="page-head__kicker mono">TOPIC / 专题</p>
        <h1 className="topic-hero__title">{topic.title}</h1>
        <p className="topic-hero__sub">{topic.sub}</p>
        <Link className="btn btn--ghost" to="/archive">← 返回报告库</Link>
      </section>
    );
  }

  const summary = digest && Array.isArray(digest.details) && digest.details.length ? digest.details : [];
  const updatedAt = digest && digest._generatedAt ? digest._generatedAt.slice(11, 16) : "—";

  return (
    <>
      <section className="topic-hero">
        <p className="page-head__kicker mono">TOPIC / 专题</p>
        <h1 className="topic-hero__title">{topic.title}</h1>
        <p className="topic-hero__sub">{topic.sub}</p>
        <div className="topic-hero__stats">
          <span className="topic-hero__stat"><strong>{items.length}</strong> 条命中新闻</span>
          <span className="topic-hero__stat"><strong>{updatedAt}</strong> 最近更新</span>
        </div>
        <button className={"btn " + (followed ? "btn--primary" : "btn--ghost")} type="button" onClick={toggleFollow} disabled={busy}>
          {followed
            ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20 6 9 17l-5-5"/></svg> 已关注</>
            : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 5v14M5 12h14"/></svg> 关注此专题</>}
        </button>
      </section>

      {summary.length > 0 && (
        <section className="topic-summary">
          <h2 className="section__title">AI 总结</h2>
          <div className="topic-summary__body">
            {summary.map((seg, i) => (
              <div className="topic-summary__seg" key={i}>
                <h3>{seg.title || "—"}</h3>
                <p>{(seg.content || "").slice(0, 600)}{(seg.content || "").length > 600 ? "…" : ""}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="topic-news" aria-label="专题新闻">
        <h2 className="section__title">相关新闻</h2>
        <ol className="topic-news__list">
          {items.length === 0 && <li className="archive-item archive-item--loading">暂无相关新闻</li>}
          {items.map((it) => {
            const id = newsId(it);
            const tagKeys = inferTags((it.title || "") + " " + (it.description || ""));
            const sub = (it.description || "").replace(/<[^>]+>/g, "").slice(0, 60);
            const desc = (it.description || "").replace(/<[^>]+>/g, "").slice(0, 160);
            const time = timeAgo(it.publishedAt);
            const src = shortSource(it.link, it.source);
            const cover = it.image
              ? <a className="pick__cover-wrap" href={it.link || "#"} target="_blank" rel="noopener noreferrer"><div className="pick__cover"><img src={it.image} alt="" loading="lazy" /></div></a>
              : <a className="pick__cover-wrap" href={it.link || "#"} target="_blank" rel="noopener noreferrer"><div className="pick__cover pick__cover--placeholder">{(it.title || "?").slice(0, 1)}</div></a>;
            return (
              <li className="pick" key={id}>
                {cover}
                <div className="pick__body">
                  <div className="pick__tags">
                    {tagKeys.map((k) => {
                      const t = TAG_LABEL[k] || TAG_LABEL.ai;
                      return <span key={k} className={`pick__tag ${t.cls}`}>{t.text}</span>;
                    })}
                  </div>
                  <h3 className="pick__title"><a href={it.link || "#"} target="_blank" rel="noopener noreferrer">{it.title || ""}</a></h3>
                  <p className="pick__sub">{sub}</p>
                  <p className="pick__desc">{desc}</p>
                  <p className="pick__meta">
                    <span className="pick__source">{src}</span>
                    <span>·</span>
                    <span className="pick__time">{time}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {related.length > 0 && (
        <section className="topic-related" aria-label="相关专题">
          <h2 className="section__title">其他专题</h2>
          <ol className="topic-related__list">
            {related.map((t) => (
              <li className="topic-card" key={t.slug}>
                <Link to={`/topic/${t.slug}`} className="topic-card__link">
                  <div className="topic-card__cover" style={{ background: `linear-gradient(135deg, ${t.color} 0%, ${t.accent} 100%)` }} />
                  <div className="topic-card__body">
                    <h3>{t.title}</h3>
                    <p>{t.sub}</p>
                    <span className="topic-card__count mono">{t.count} 条</span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
