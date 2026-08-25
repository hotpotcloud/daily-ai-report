import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

const ToastCtx = createContext({ push: () => {} });

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((msg, type = "info", ms = 2400) => {
    const id = ++idRef.current;
    setItems((s) => [...s, { id, msg, type }]);
    setTimeout(() => {
      setItems((s) => s.map((it) => (it.id === id ? { ...it, leaving: true } : it)));
      setTimeout(() => setItems((s) => s.filter((it) => it.id !== id)), 220);
    }, ms);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((it) => (
          <div key={it.id} className={`toast toast--${it.type}${it.leaving ? " is-leaving" : ""}`}>
            {it.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
