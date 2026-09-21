import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authApi } from "@/api/endpoints";
import { API_UNREACHABLE, ApiError, bootstrapSession, setToken } from "@/api/http";
import type { User } from "@/api/types";

interface AuthValue {
  user: User | null;
  ready: boolean;
  isManager: boolean;
  login: (identifier: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  /** true when the PHP API could not be reached at all (server down / wrong URL / CORS). */
  apiDown: boolean;
}

// Keep a single context instance even if this module is evaluated twice
// (dev hot-reload / route code-splitting), otherwise consumers see a null context.
const globalStore = globalThis as unknown as { __b29AuthContext?: React.Context<AuthValue | null> };
const AuthContext =
  globalStore.__b29AuthContext ??
  (globalStore.__b29AuthContext = createContext<AuthValue | null>(null));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // No access token is persisted anywhere: mint one from the httpOnly
    // refresh cookie before the first authenticated request.
    bootstrapSession()
      .catch(() => false)
      .then(() => authApi.me())
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setApiDown(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setUser(null);
        setApiDown(error instanceof ApiError && error.code === API_UNREACHABLE);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const result = await authApi.login(identifier, password);
    setApiDown(false);
    setToken(result.access_token);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setToken(null);
      setUser(null);
    }
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    await authApi.changePassword(current, next);
    const me = await authApi.me();
    setUser(me);
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await authApi.me());
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      ready,
      apiDown,
      isManager: !!user?.roles.includes("manager"),
      login,
      logout,
      changePassword,
      refreshUser,
    }),
    [user, ready, apiDown, login, logout, changePassword, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
