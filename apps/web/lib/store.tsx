"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  activeMembership,
  emptyStore,
  getActiveCompany,
  getSessionUser,
  loadStore,
  type Store,
} from "@/lib/repo";

type StoreContextValue = {
  store: Store;
  ready: boolean;
  refresh: () => void;
  setStore: (next: Store) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  // localStorage only exists on the client; reading it here would break hydration.
  const [store, setStoreState] = useState<Store>(emptyStore);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStoreState(loadStore());
    setReady(true);
  }, []);

  const setStore = useCallback((next: Store) => {
    setStoreState(next);
  }, []);

  const refresh = useCallback(() => {
    setStoreState(loadStore());
  }, []);

  const value = useMemo(
    () => ({ store, ready, refresh, setStore }),
    [store, ready, refresh, setStore],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore requires StoreProvider");
  return ctx;
}

export function useSession() {
  const { store, ready } = useStore();
  const user = getSessionUser(store);
  const company = getActiveCompany(store);
  const membership = activeMembership(store);
  return { store, ready, user, company, membership };
}
