"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { listStores } from "@/lib/api/stores";
import { useAuth } from "@/lib/auth-context";
import type { Store } from "@/lib/api/types";

const ACTIVE_STORE_KEY = "stride_active_store";

interface ActiveStoreContextValue {
  stores: Store[];
  isLoading: boolean;
  activeStoreId: string | null;
  activeStore: Store | null;
  setActiveStoreId: (id: string) => void;
}

const ActiveStoreContext = React.createContext<ActiveStoreContextValue | null>(null);

export function ActiveStoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeStoreId, setActiveStoreIdState] = React.useState<string | null>(null);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["stores"],
    queryFn: listStores,
    enabled: !!user,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    const stored = window.localStorage.getItem(ACTIVE_STORE_KEY);
    if (stored) setActiveStoreIdState(stored);
  }, []);

  React.useEffect(() => {
    if (!activeStoreId && stores.length > 0) {
      setActiveStoreIdState(stores[0].id);
    }
  }, [activeStoreId, stores]);

  const setActiveStoreId = React.useCallback((id: string) => {
    window.localStorage.setItem(ACTIVE_STORE_KEY, id);
    setActiveStoreIdState(id);
  }, []);

  const activeStore = stores.find((s) => s.id === activeStoreId) ?? null;

  const value = React.useMemo(
    () => ({ stores, isLoading, activeStoreId, activeStore, setActiveStoreId }),
    [stores, isLoading, activeStoreId, activeStore, setActiveStoreId],
  );

  return <ActiveStoreContext.Provider value={value}>{children}</ActiveStoreContext.Provider>;
}

export function useActiveStore() {
  const ctx = React.useContext(ActiveStoreContext);
  if (!ctx) throw new Error("useActiveStore must be used within ActiveStoreProvider");
  return ctx;
}
