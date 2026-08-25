import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useToast } from "./ToastHost.jsx";
import { inferTags, TAG_LABEL, inferHashTags, timeAgo, shortSource, estimateReadMinutes, makeSub, newsId } from "../lib/text.js";

export default function PickCard({ item, onChange, showHash = true }) {
  const id = newsId(item);
  const isLead = inferTags((item.title || "") + " " + (item.description || "")).includes("policy") ||
                 inferTags((item.title || "") + " " + (item.description || "")).includes("ai");
  const tagKeys = inferTags((item.title || "") + " " + (item.description || ""));
  const sub = makeSub(item.description) || (item.title || "").slice(0, 50);
  const desc = (item.description || "").replace(/<[^>]+>/g, "").slice(0, 160);
  const time = timeAgo(item.publishedAt);
  const read = estimateReadMinutes((item.title || "") + (item.description || ""));
  const src = shortSource(item.link, item.source);
  const hashTags = showHash ? inferHashTags((item.title || "") + " " + (item.description || "")) : [];
  const cover = item.image
    ? <a className="pick__cover-wrap" href={item.link || "#"} target="_blank" rel="noopener noreferrer"><div className="pick__cover"><img src={item.image} alt="" loading="lazy" /></div></a>
    : <a className="pick__cover-wrap" href={item.link || "#"} target="_blank" rel="noopener noreferrer"><div className="pick__cover pick__cover--placeholder">{(item.title || "?").slice(0, 1)}</div></a>;
  return (
    <li className="pick" data-id={id}>
      {cover}
      <div className="pick__body">
        <div className="pick__tags">
          {isLead && <span className="pick__tag pick__tag--lead">重磅</span>}
          {tagKeys.map((k) => <span key={k} className={`pick__tag ${TAG_LABEL[k].cls}`}>{TAG_LABEL[k].text}</span>)}
          <CollectButton id={id} item={item} onChange={onChange} />
        </div>
        <h3 className="pick__title"><a href={item.link || "#"} target="_blank" rel="noopener noreferrer">{item.title || ""}</a></h3>
        <p className="pick__sub">{sub}</p>
        <p className="pick__desc">{desc}</p>
        <p className="pick__meta">
          <span className="pick__source">{src}</span>
          <span>·</span>
          <span className="pick__time">{time}</span>
          <span>·</span>
          <span className="pick__read">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            {read} 分钟
          </span>
        </p>
        {hashTags.length > 0 && (
          <p className="pick__hash">
            {hashTags.map((h) => <a key={h.label} href={`/?q=${encodeURIComponent(h.label)}`}># {h.label}</a>)}
          </p>
        )}
      </div>
    </li>
  );
}

function CollectButton({ id, item, onChange }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(false);

  // 初始状态:已登录则从 /api/me/collections 查;未登录则查 localStorage
  useEffect(() => {
    if (!id) return;
    if (user) {
      api.collectionsList().then((d) => {
        setOn((d.collections || []).some((c) => c.id === id));
      }).catch(() => {});
    } else {
      try {
        const arr = JSON.parse(localStorage.getItem("sb.localCollected") || "[]");
        setOn(arr.includes(id));
      } catch (_) {}
    }
  }, [user, id]);

  const click = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (user) {
        if (on) {
          await api.collectionsRemove(id);
          setOn(false);
          toast.push("已取消收藏", "info");
        } else {
          await api.collectionsAdd({ id, title: item.title, link: item.link, sub: makeSub(item.description), image: item.image, source: item.source });
          setOn(true);
          toast.push("已收藏", "success");
        }
        onChange && onChange();
      } else {
        // 未登录:localStorage 兜底
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem("sb.localCollected") || "[]"); } catch (_) {}
        if (on) { arr = arr.filter((x) => x !== id); setOn(false); toast.push("已取消收藏(本地)", "info"); }
        else { arr.unshift(id); setOn(true); toast.push("已收藏(本地),登录后可跨设备同步", "success"); }
        localStorage.setItem("sb.localCollected", JSON.stringify(arr));
      }
    } catch (e) {
      toast.push("操作失败:" + e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className={"pick__collect" + (on ? " is-on" : "")} type="button" onClick={click} disabled={busy} aria-label="收藏" title={on ? "已收藏" : "收藏"}>
      <svg viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
    </button>
  );
}
