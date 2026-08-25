import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useToast } from "../components/ToastHost.jsx";

export default function ArchivePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("date");
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [ar, tp] = await Promise.all([
          api.archive(),
          api.topics().catch(() => ({ topics: [] }))
        ]);
        const briefs = (ar.items || []).map((d) => {
          const m = (d.file || "").match(/topic-(\w+)/);
          const topic = m ? m[1] : null;
          return { ...d, topic };
        });
        const topics = (tp.topics || []).map((t) => ({
          file: "topic-" + t.slug + ".html",
          date: new Date().toISOString().slice(0, 10),
          title: t.title,
          summary: t.sub,
          marketSentiment: "",
          aiSentiment: "",
          size: 0,
          mtime: new Date().toISOString(),
          topic: t.slug,
          isTopic: true
        }));
        setItems([...briefs, ...topics]);
      } catch (e) {
        toast.push("加载失败:" + e.message, "error", 4000);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = (() => {
    let list = items;
    if (filter === "brief") list = list.filter((d) => !d.isTopic);
    else if (filter === "topic") list = list.filter((d) => d.isTopic);
    if (sort === "date") list = list.slice().sort((a, b) => (b.mtime || "").localeCompare(a.mtime || ""));
    else if (sort === "size") list = list.slice().sort((a, b) => (b.size || 0) - (a.size || 0));
    return list;
  })();

  return (
    <>
      <section className="page-head">
        <p className="page-head__kicker mono">ARCHIVE / 报告库</p>
        <h1 className="page-head__title">历史简报与专题</h1>
        <p className="page-head__sub">按日期倒序排列 · 共 {filtered.length} 篇</p>
      </section>

      <section className="archive-filters" aria-label="筛选">
        <div className="archive-filters__tabs">
          <button className={"archive-tab" + (filter === "all" ? " is-active" : "")} type="button" onClick={() => setFilter("all")}>全部</button>
          <button className={"archive-tab" + (filter === "brief" ? " is-active" : "")} type="button" onClick={() => setFilter("brief")}>每日简报</button>
          <button className={"archive-tab" + (filter === "topic" ? " is-active" : "")} type="button" onClick={() => setFilter("topic")}>专题</button>
        </div>
        <div className="archive-filters__sort">
          <span className="mono">按</span>
          <button className={"archive-sort" + (sort === "date" ? " is-active" : "")} type="button" onClick={() => setSort("date")}>日期</button>
          <button className={"archive-sort" + (sort === "size" ? " is-active" : "")} type="button" onClick={() => setSort("size")}>篇幅</button>
        </div>
      </section>

      <ol className="archive-list">
        {loading && <li className="archive-item archive-item--loading">正在加载报告库…</li>}
        {!loading && filtered.length === 0 && <li className="archive-item archive-item--loading">暂无报告</li>}
        {!loading && filtered.map((d, i) => {
          const date = d.date || (d.mtime ? d.mtime.slice(0, 10) : "—");
          const href = d.isTopic ? `/topic/${d.topic}` : `/archive#file=${encodeURIComponent(d.file)}`;
          return (
            <li className="archive-item" key={i}>
              <Link className="archive-item__link" to={href}>
                <div className="archive-item__head">
                  <span className="archive-item__date mono">{date}</span>
                  {d.isTopic
                    ? <span className="archive-tag archive-tag--topic">专题</span>
                    : <span className="archive-tag">简报</span>}
                  {d.marketSentiment ? <span className="archive-tag archive-tag--muted">{d.marketSentiment}</span> : null}
                </div>
                <h3 className="archive-item__title">{d.title || d.file || "未命名"}</h3>
                <p className="archive-item__summary">{d.summary || "—"}</p>
                <p className="archive-item__meta mono">
                  <span>{d.isTopic ? "专题页" : (d.file || "—")}</span>
                  <span>·</span>
                  <span>{d.size ? (d.size / 1024).toFixed(1) + " KB" : "—"}</span>
                </p>
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}
