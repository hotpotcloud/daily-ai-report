// web/src/components/invest/WatchlistEditor.jsx
// 自选股编辑器:输入代码 → 加入 / 已有列表 → 移除
// 本期走 localStorage,二期切服务端

import { useState } from "react";
import { useToast } from "../ToastHost.jsx";

// 简易代码校验(支持 sh/sz/hk + 数字 或 btc)
const CODE_RE = /^(sh|sz|hk)?[0-9]{5,6}$|^us[A-Z]{1,5}$|^btc$/i;

export default function WatchlistEditor({ onAdd, hint = "支持 sh/sz/hk 6 位代码 或 us 开头美股代码 或 btc" }) {
  const [v, setV] = useState("");
  const toast = useToast();

  const submit = (e) => {
    e?.preventDefault();
    const s = v.trim().toLowerCase();
    if (!s) return;
    if (!CODE_RE.test(s)) {
      toast.push("代码格式不对(例:sh600519 / sz000001 / btc)", "error");
      return;
    }
    onAdd?.(s);
    setV("");
  };

  return (
    <form className="watchlist-editor" onSubmit={submit} role="form" aria-label="添加自选">
      <input
        className="watchlist-editor__input mono"
        type="text"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="输入代码,如 sh600519"
        aria-label="自选股代码"
      />
      <button className="btn btn--primary watchlist-editor__btn" type="submit">加入自选</button>
      <span className="watchlist-editor__hint mono">{hint}</span>
    </form>
  );
}
