import { useState, useEffect, useRef } from "react";
import { chatStream } from "../api.js";

const AI_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 4 7v10l8 5 8-5V7l-8-5z"/><path d="M12 22V12"/><path d="m4 7 8 5 8-5"/></svg>`;
const USER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"/></svg>`;

const SUGGESTS = [
  "今天 AI 行业最值得关注的 1 件事?",
  "半导体景气最近怎么走?",
  "市场情绪最近是偏多还是偏空?为什么?",
  "避险需求指标变化趋势?"
];

function renderLite(text) {
  return (text || "")
    .split(/\n{2,}/)
    .map((p) => {
      const lines = p.split(/\n/).map((l) => /^[-*]\s+/.test(l) ? "• " + l.replace(/^[-*]\s+/, "") : l);
      const inner = lines.map((l) => l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")).join("<br>");
      return `<p>${inner}</p>`;
    })
    .join("");
}

export default function Chat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // [{role, content}]
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const streamRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const send = async (text) => {
    const t = (text || input).trim();
    if (!t || busy) return;
    setInput("");
    autoResize();
    setBusy(true);
    const next = [...messages, { role: "user", content: t }];
    setMessages(next);
    // 立即显示 ai 占位
    const aiIdx = next.length;
    setMessages((s) => [...s, { role: "ai", content: "" }]);
    let full = "";
    try {
      await chatStream([...next], (delta) => {
        full += delta;
        setMessages((s) => s.map((m, i) => i === aiIdx ? { ...m, content: full } : m));
      });
    } catch (e) {
      setMessages((s) => s.map((m, i) => i === aiIdx ? { role: "ai", content: "**出错了**\n\n" + (e.message || "未知错误"), error: true } : m));
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const clear = () => setMessages([]);

  const onSubmit = (e) => { e.preventDefault(); send(); };
  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };
  const autoResize = () => {
    const el = inputRef.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 7.5 * 16) + "px";
  };

  return (
    <>
      {!open && (
        <button className="fab" type="button" onClick={() => setOpen(true)} aria-label="打开 AI 助手">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
          <span className="fab__label">问 AI</span>
        </button>
      )}
      {open && (
        <div className="chat-modal is-open" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="chat-modal__panel" role="document">
            <header className="chat-modal__head">
              <div className="chat-modal__title"><span className="chat-modal__dot" />AI 对话</div>
              <div className="chat-modal__actions">
                <button className="icon-btn" type="button" onClick={clear} aria-label="清空"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
                <button className="icon-btn" type="button" onClick={() => setOpen(false)} aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
              </div>
            </header>
            <div className="chat-modal__body">
              <div className="chat-stream">
                {messages.length === 0 && (
                  <div className="msg msg--ai msg--welcome">
                    <div className="msg__avatar msg__avatar--ai" dangerouslySetInnerHTML={{ __html: AI_SVG }} />
                    <div className="msg__bubble">
                      <p className="msg__title">AI 助手</p>
                      <p className="msg__body">基于本页实时新闻回答问题,试试:</p>
                      <ul className="msg__suggest">
                        {SUGGESTS.map((q) => (
                          <li key={q}><button className="chip" type="button" onClick={() => send(q)}>{q}</button></li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`msg msg--${m.role}${m.error ? " msg--error" : ""}`}>
                    <div className={`msg__avatar msg__avatar--${m.role}`} dangerouslySetInnerHTML={{ __html: m.role === "ai" ? AI_SVG : USER_SVG }} />
                    <div className="msg__bubble">
                      <div className="msg__body" dangerouslySetInnerHTML={{ __html: renderLite(m.content) + (busy && i === messages.length - 1 && m.role === "ai" && m.content ? "" : (busy && i === messages.length - 1 && m.role === "ai" ? '<span class="cursor"></span>' : "")) }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <form className="chat-modal__input" onSubmit={onSubmit} autoComplete="off">
              <textarea
                ref={inputRef}
                className="chat-input__field"
                rows={1}
                placeholder="问点什么…(Enter 发送,Shift+Enter 换行)"
                value={input}
                onChange={(e) => { setInput(e.target.value); autoResize(); }}
                onKeyDown={onKey}
                maxLength={2000}
              />
              <button type="submit" className="chat-send" disabled={!input.trim() || busy} aria-label="发送">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
