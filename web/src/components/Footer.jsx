import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="footer">
      <span className="mono">© 2026 · Signal Board · 编辑部智能晨报 · No.003</span>
      <span className="footer__sep">·</span>
      <span className="mono">北京时间 · 实时更新</span>
      <span className="footer__sep">·</span>
      <Link to="/" className="footer__link">首页</Link>
      <span className="footer__sep">·</span>
      <Link to="/archive" className="footer__link">报告库</Link>
      <span className="footer__sep">·</span>
      <Link to="/me" className="footer__link">个人中心</Link>
    </footer>
  );
}
