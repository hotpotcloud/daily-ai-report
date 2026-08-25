import { useEffect, useState, useCallback, createContext, useContext } from "react";
import { api } from "./api.js";

const AuthCtx = createContext({ user: null, providers: [], refresh: () => {}, logout: () => {} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [providers, setProviders] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const d = await api.authMe();
      setUser(d.user || null);
      setProviders(d.providers || []);
    } catch (_) {
      setUser(null);
      setProviders([]);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(() => {
    window.location.href = "/api/auth/logout";
  }, []);

  return <AuthCtx.Provider value={{ user, providers, refresh, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
