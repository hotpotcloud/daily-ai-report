import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api.js";
import { useToast } from "../components/ToastHost.jsx";
import { inferTags, TAG_LABEL, timeAgo, shortSource, newsId } from "../lib/text.js";

const CATEGORY_LABELS = {
  ai: { kicker: "CATEGORY / AI", label: "AI · 人工智能", sub: "大模型、算力、推理、训练与产业链信号" },
  tech: { kicker: "CATEGORY / TECH", label: "科技 · 硬件与软件", sub: "芯片、半导体、消费电子与平台动态" },
  market: { kicker: "CATEGORY / MARKET", label: "市场 · 资金与情绪", sub: "A 股、港股、美股、加密、宏观与流动性" },
  policy: { kicker: "CATEGORY / POLICY", label: "政策 · 监管与产业", sub: "出口管制、产业政策、监管动态与立法" }
};

export default function CategoryPage() {
  const { slug } = useParams();
  const [data, setData] = useState({ category: null, items: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const meta = CATEGORY_LABELS[slug] || { kicker: "CATEGORY / 分类", label: "未分类", sub: "" };

  useEffect(() => {
    setData({ category: null, items: [], count: 0 });
    setLoading(true);
    (async () => {
      try {
        const d = await api.category(slug);
        if (!d.category) {
          setData({ category: { label: "分类不存在", sub: "" }, items: [], count: 0 });
        } else {
          setData(d);
          document.title = `${d.category.label} · Signal Board`;
        }
      } catch (e) {
        toast.push("加载失败:" + e.message, "error", 4000);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  return (
    <>
      <section className="page-head">
        <p className="page-head__kicker mono">{meta.kicker}</p>
        <h1 className="page-head__title">{data.category ? data.category.label : meta.label}</h1>
        <p className="page-head__sub">{data.category ? data.category.sub : meta.sub}</p>
      </section>

      <section className="cat-stats">
        <span className="cat-stats__item"><strong>{data.count || 0}</strong> 条新闻</span>
        <span className="cat-stats__sep">·</span>
        <span className="cat-stats__item">实时拉取</span>
      </section>

      <section className="cat-news">
        <ol className="cat-news__list">
          {loading && <li className="archive-item archive-item--loading">正在加载…</li>}
          {!loading && data.items.length === 0 && <li className="archive-item archive-item--loading">暂无相关新闻</li>}
          {!loading && data.items.map((it) => {
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
    </>
  );
}
