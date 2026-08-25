import { useState, useEffect, useRef } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function Topbar() {
  const { user, providers } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, []);

  const onSearch = (e) => {
    if (e.key === "Enter") {
      const q = e.target.value.trim();
      if (q) navigate(`/?q=${encodeURIComponent(q)}`);
    }
  };

  return (
    <header className="topbar" role="banner">
      <div className="topbar__inner">
        <Link className="topbar__brand" to="/">
          <span className="topbar__brand-name">Signal Board</span>
          <span className="topbar__brand-sub">编辑部智能晨报</span>
        </Link>
        <nav className="topbar__menu" aria-label="主导航">
          <NavLink className={({isActive}) => "topbar__item" + (isActive ? " is-active" : "")} to="/" end>今日简报</NavLink>
          <NavLink className={({isActive}) => "topbar__item" + (isActive ? " is-active" : "")} to="/category/ai">AI</NavLink>
          <NavLink className={({isActive}) => "topbar__item" + (isActive ? " is-active" : "")} to="/category/tech">科技</NavLink>
          <NavLink className={({isActive}) => "topbar__item" + (isActive ? " is-active" : "")} to="/category/market">市场</NavLink>
          <NavLink className={({isActive}) => "topbar__item" + (isActive ? " is-active" : "")} to="/category/policy">政策</NavLink>
          <NavLink className={({isActive}) => "topbar__item topbar__item--menu" + (isActive ? " is-active" : "")} to="/archive">报告库
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </NavLink>
        </nav>
        <div className="topbar__right">
          <div className="topbar__search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="search" placeholder="搜索公司 / 行业 / 主题 / 人物" onKeyDown={onSearch} aria-label="搜索" />
          </div>
          <button className="topbar__user" ref={ref} type="button" data-logged-in={user ? "true" : "false"} onClick={() => setOpen((v) => !v)} aria-haspopup="true" aria-expanded={open}>
            {user ? (
              user.avatar ? <span className="topbar__avatar"><img src={user.avatar} alt="" /></span> : <span className="topbar__avatar">{(user.name || user.login || "U").slice(0, 1)}</span>
            ) : <span className="topbar__avatar">登</span>}
            <span>{user ? (user.name || user.login) : "登录"}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            {open && <UserPopover user={user} providers={providers} />}
          </button>
        </div>
      </div>
    </header>
  );
}

function UserPopover({ user, providers }) {
  if (user) {
    return (
      <div className="user-popover is-open" role="menu">
        <div className="user-popover__head">
          <div className="topbar__avatar">
            {user.avatar ? <img src={user.avatar} alt="" /> : <span>{(user.name || user.login || "U").slice(0, 1)}</span>}
          </div>
          <div>
            <div className="user-popover__name">{user.name || user.login}<span className="user-popover__provider">{user.provider}</span></div>
            <div className="user-popover__sub">{user.login}</div>
          </div>
        </div>
        <Link className="user-popover__btn" to="/me" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          个人中心(收藏 / 关注)
        </Link>
        <a className="user-popover__btn user-popover__btn--danger" href="/api/auth/logout" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          退出登录
        </a>
      </div>
    );
  }
  return (
    <div className="user-popover is-open" role="menu">
      <div className="user-popover__empty" style={{ borderBottom: "1px solid var(--border)", paddingBottom: ".6rem", marginBottom: ".4rem" }}>
        登录后可订阅简报、收藏文章、跨设备同步关注主题。
      </div>
      {providers.includes("github") && (
        <a className="user-popover__btn" href="/api/auth/github">
          <div className="user-popover__provider-icon user-popover__provider-icon--github">GH</div>
          <span>使用 GitHub 登录</span>
        </a>
      )}
      {providers.includes("google") && (
        <a className="user-popover__btn" href="/api/auth/google">
          <div className="user-popover__provider-icon user-popover__provider-icon--google">G</div>
          <span>使用 Google 登录</span>
        </a>
      )}
      {!providers.length && <div className="user-popover__empty">暂未配置登录通道</div>}
    </div>
  );
}
