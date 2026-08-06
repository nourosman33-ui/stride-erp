"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { login as loginRequest } from "@/lib/api/auth";
import { ApiError, clearAuthCookie, onUnauthorized, setAuthCookie } from "@/lib/api/client";
import type { AuthUser, Role } from "@/lib/api/types";

const USER_STORAGE_KEY = "stride_user";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const router = useRouter();

  const logout = React.useCallback(
    (message?: string) => {
      clearAuthCookie();
      window.localStorage.removeItem(USER_STORAGE_KEY);
      setUser(null);
      if (message) toast.error(message);
      router.replace("/login");
    },
    [router],
  );

  React.useEffect(() => {
    const stored = window.localStorage.getItem(USER_STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        window.localStorage.removeItem(USER_STORAGE_KEY);
      }
    }
    setIsLoading(false);

    onUnauthorized(() => logout("Your session expired — please sign in again."));
  }, [logout]);

  const login = React.useCallback(async (email: string, password: string) => {
    try {
      const result = await loginRequest(email, password);
      setAuthCookie(result.accessToken);
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(result.user));
      setUser(result.user);
    } catch (err) {
      if (err instanceof ApiError) {
        throw new Error(err.message);
      }
      throw err;
    }
  }, []);

  const hasRole = React.useCallback(
    (...roles: Role[]) => !!user && roles.some((r) => user.roles.includes(r)),
    [user],
  );

  const value = React.useMemo(
    () => ({ user, isLoading, login, logout: () => logout(), hasRole }),
    [user, isLoading, login, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
