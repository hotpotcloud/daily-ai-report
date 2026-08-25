import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useToast } from "../components/ToastHost.jsx";

const TOPIC_META = {
  compute: { title: "国产算力产业链", sub: "国产芯片、服务器、存储与操作系统全景追踪", color: "#1a2236" },
  capex: { title: "全球 AI 资本开支", sub: "云厂商与互联网大厂投入对比与趋势", color: "#0a5a6a" },
  price: { title: "模型价格战", sub: "大模型降价、开源与生态竞争格局", color: "#5a1a3a" }
};

export default function MePage() {
  const { user, providers, refresh, logout } = useAuth();
  const [tab, setTab] = useState("collections");
  const [data, setData] = useState({ collections: [], followed: [] });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.me();
      setData({ collections: d.collections || [], followed: d.followed || [] });
    } catch (e) {
      // 401 等
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  if (!user) {
    return (
      <section className="me-gate">
        <div className="me-gate__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"/></svg>
        </div>
        <h1 className="me-gate__title">登录后查看个人中心</h1>
        <p className="me-gate__sub">收藏的文章、关注的专题、订阅的简报——所有内容跨设备同步。</p>
        <div className="me-gate__actions">
          {providers.includes("github") && <a className="btn btn--primary" href="/api/auth/github">使用 GitHub 登录</a>}
          {providers.includes("google") && <a className="btn btn--primary" href="/api/auth/google">使用 Google 登录</a>}
          {!providers.length && <p className="me-gate__hint">暂未配置登录通道</p>}
        </div>
      </section>
    );
  }

  const removeCollection = async (id) => {
    if (busy) return;
    setBusy(true);
    try {
      const d = await api.collectionsRemove(id);
      setData((s) => ({ ...s, collections: d.collections || [] }));
      toast.push("已取消收藏", "info");
    } catch (e) {
      toast.push("操作失败:" + e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const unfollow = async (slug) => {
    if (busy) return;
    setBusy(true);
    try {
      const d = await api.followRemove(slug);
      setData((s) => ({ ...s, followed: d.followed || [] }));
      toast.push("已取消关注", "info");
    } catch (e) {
      toast.push("操作失败:" + e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="me-page">
      <header className="me-page__head">
        <div className="me-page__avatar">
          {user.avatar
            ? <img src={user.avatar} alt="" />
            : <span>{(user.name || user.login || "U").slice(0, 1)}</span>}
        </div>
        <div className="me-page__id">
          <h1 className="me-page__name">{user.name || user.login || "已登录"}</h1>
          <p className="me-page__sub">
            <span className="me-page__provider">{user.provider || ""}</span>
            {user.email ? " · " + user.email : ""}
          </p>
          <p className="me-page__login mono">{user.login && user.login !== user.name ? "@" + user.login : "已登录"}</p>
        </div>
        <button className="me-page__logout" type="button" onClick={logout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          退出登录
        </button>
      </header>

      <div className="me-stats">
        <div className="me-stat">
          <span className="me-stat__num">{data.collections.length}</span>
          <span className="me-stat__label">收藏文章</span>
        </div>
        <div className="me-stat">
          <span className="me-stat__num">{data.followed.length}</span>
          <span className="me-stat__label">关注专题</span>
        </div>
        <div className="me-stat">
          <span className="me-stat__num">{providers.length}</span>
          <span className="me-stat__label">登录渠道</span>
        </div>
      </div>

      <div className="me-tabs" role="tablist">
        <button className={"me-tab" + (tab === "collections" ? " is-active" : "")} type="button" onClick={() => setTab("collections")}>收藏</button>
        <button className={"me-tab" + (tab === "followed" ? " is-active" : "")} type="button" onClick={() => setTab("followed")}>关注专题</button>
      </div>

      {tab === "collections" && (
        <section className="me-section">
          <ol className="me-list">
            {loading && <li className="me-empty">加载中…</li>}
            {!loading && data.collections.length === 0 && (
              <li className="me-empty">还没有收藏 · 去 <Link to="/">今日简报</Link> 收藏一些文章</li>
            )}
            {!loading && data.collections.map((c) => (
              <li className="me-list__item" key={c.id}>
                <a className="me-list__link" href={c.link || "#"} target="_blank" rel="noopener noreferrer">
                  <h4>{c.title || "未命名"}</h4>
                  <p>{(c.sub || c.summary || "").slice(0, 120)}</p>
                  <span className="mono">{c.savedAt ? new Date(c.savedAt).toLocaleString("zh-CN") : ""}</span>
                </a>
                <button className="me-list__remove" type="button" aria-label="取消收藏" onClick={() => removeCollection(c.id)} disabled={busy}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {tab === "followed" && (
        <section className="me-section">
          <ol className="me-grid">
            {!loading && data.followed.length === 0 && (
              <li className="me-empty">还没有关注专题 · 去 <Link to="/">专题入口</Link> 关注一些</li>
            )}
            {!loading && data.followed.map((slug) => {
              const m = TOPIC_META[slug] || { title: slug, sub: "", color: "#666" };
              return (
                <li className="me-topic-card" key={slug}>
                  <Link to={`/topic/${slug}`} className="me-topic-card__link" style={{ background: `linear-gradient(135deg, ${m.color} 0%, #1a1a1a 100%)` }}>
                    <div className="me-topic-card__body">
                      <h4>{m.title}</h4>
                      <p>{m.sub}</p>
                    </div>
                    <button className="me-topic-card__unfollow" type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); unfollow(slug); }} disabled={busy}>
                      取消关注
                    </button>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </section>
  );
}
