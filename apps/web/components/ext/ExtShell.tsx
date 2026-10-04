"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import {
  canCaptureAs,
  logout,
  membershipsForUser,
  setActiveCompany,
  userHasCompanyMembership,
} from "@/lib/repo";
import { useSession, useStore } from "@/lib/store";

export function ExtShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setStore } = useStore();
  const { ready, user, company, membership, store } = useSession();

  const workRole = useMemo(
    () => store.workRoles.find((r) => r.id === membership?.workRoleId) ?? null,
    [store.workRoles, membership?.workRoleId],
  );
  const canRecord = canCaptureAs(membership, workRole);

  const companies = useMemo(() => {
    if (!user) return [];
    return membershipsForUser(store, user.id)
      .map((m) => store.companies.find((c) => c.id === m.companyId))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
  }, [store, user]);

  const onLearn = Boolean(pathname?.startsWith("/ext/learn"));
  const onRecord =
    canRecord &&
    Boolean(
      pathname === "/ext" ||
        pathname?.startsWith("/ext/capture") ||
        (pathname?.startsWith("/ext") && !onLearn && pathname !== "/ext/enable-mic"),
    );

  if (!ready) {
    return (
      <main className="ext-root">
        <div className="ext-start">
          <p className="muted">Loading…</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="ext-root">
        <div className="ext-start">
          <div className="ext-brand-lockup">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mira-mark.svg" alt="" width={28} height={28} aria-hidden />
            <strong>Mira</strong>
          </div>
          <p className="muted">Sign in to Mira.</p>
          <Link className="btn btn-primary btn-lg" href="/login?next=/ext">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  if (!userHasCompanyMembership(store, user.id)) {
    return (
      <main className="ext-root">
        <div className="ext-start">
          <strong>Waiting for invite</strong>
          <p className="muted">Signed in as {user.email}. Open your invite link first.</p>
          <button
            className="btn"
            type="button"
            onClick={() => {
              void (async () => {
                const { signOutFirebase } = await import("@/lib/firebase/auth");
                await signOutFirebase();
                setStore(logout());
                router.push("/login?next=/ext");
              })();
            }}
          >
            Switch account
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="ext-root">
      <header className="ext-header ext-header-slim">
        <div className="ext-brand">
          <div className="ext-brand-lockup">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mira-mark.svg" alt="" width={20} height={20} aria-hidden />
            <strong>Mira</strong>
          </div>
          {companies.length > 1 ? (
            <label className="ext-company-switch">
              <span className="sr-only">Company</span>
              <select
                value={company?.id ?? ""}
                onChange={(e) => {
                  try {
                    setStore(setActiveCompany(e.target.value));
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="ext-company-inline">{company?.name}</span>
          )}
        </div>
        <div className="ext-header-actions">
          {canRecord ? (
            <nav className="ext-mode-tabs" aria-label="Mira mode">
              <Link href="/ext/learn" className={onLearn ? "is-active" : undefined}>
                Learn
              </Link>
              <Link href="/ext" className={onRecord ? "is-active" : undefined}>
                Record
              </Link>
            </nav>
          ) : (
            <span className="ext-mode-label">Your learning plan</span>
          )}
          {membership?.platformRole === "owner" ? (
            <a className="ext-admin-link" href="/admin" target="_blank" rel="noreferrer">
              Admin
            </a>
          ) : null}
        </div>
      </header>
      {children}
    </main>
  );
}
