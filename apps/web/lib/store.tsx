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
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { watchAuth } from "@/lib/firebase/auth";
import { completeAuthSession } from "@/lib/firebase/session";
import { isPromoDemo, markPromoDemo } from "@/lib/promoDemo";
import {
  activeMembership,
  clearSessionUserId,
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

  const setStore = useCallback((next: Store) => {
    setStoreState({
      ...emptyStore(),
      ...next,
      agents: next.agents ?? [],
      abilities: next.abilities ?? [],
      abilityRuns: next.abilityRuns ?? [],
      integrationConnections: next.integrationConnections ?? [],
      externalPeople: next.externalPeople ?? [],
      knowledgeTopics: next.knowledgeTopics ?? [],
      captureTasks: next.captureTasks ?? [],
      learningSessions: next.learningSessions ?? [],
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Theater / Playwright seeds localStorage with a demo session — don't let
    // Firebase auth wipe sessionUserId while recording promos.
    if (isPromoDemo()) {
      markPromoDemo();
      setStoreState(loadStore());
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    if (!isFirebaseConfigured()) {
      setStoreState(loadStore());
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    const unsub = watchAuth((fbUser) => {
      void (async () => {
        if (cancelled) return;
        if (!fbUser) {
          clearSessionUserId();
          if (!cancelled) {
            setStoreState({ ...loadStore(), sessionUserId: null });
            setReady(true);
          }
          return;
        }
        try {
          const next = await completeAuthSession(fbUser);
          if (!cancelled) {
            setStore(next);
            setReady(true);
          }
        } catch (err) {
          console.error("Auth session hydrate failed", err);
          if (!cancelled) {
            setStoreState(loadStore());
            setReady(true);
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [setStore]);

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
