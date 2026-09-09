// web/src/pages/InvestPage.jsx
// 投资模块的壳:子导航 + Outlet

import { NavLink, Outlet } from "react-router-dom";

export default function InvestPage() {
  return (
    <div className="invest-page">
      <header className="invest-page__head">
        <p className="invest-page__kicker mono">FINANCE · 投资</p>
        <h1 className="invest-page__title">投资看板</h1>
        <p className="invest-page__lede">
          实时行情 · 策略库 · 投资信号。把市场情绪和日报信号变成可执行视角。
        </p>
      </header>
      <nav className="invest-page__tabs" aria-label="投资子导航">
        <NavLink
          to="/invest/dashboard"
          className={({ isActive }) => "invest-page__tab" + (isActive ? " is-active" : "")}
          end
        >看板</NavLink>
        <NavLink
          to="/invest/strategies"
          className={({ isActive }) => "invest-page__tab" + (isActive ? " is-active" : "")}
        >策略库</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
