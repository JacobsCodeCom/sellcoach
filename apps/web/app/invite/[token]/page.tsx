"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Company, Invite } from "@mira/core";
import { AuthBrand } from "@/components/AuthBrand";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { signOutFirebase } from "@/lib/firebase/auth";
import { fetchInviteByToken, mergeInviteIntoStore } from "@/lib/firebase/sync";
import {
  acceptInvite,
  getInviteByToken,
  loadStore,
  logout,
  membershipsForUser,
  persistStore,
} from "@/lib/repo";
import { useSession, useStore } from "@/lib/store";

async function loadInviteRemote(token: string): Promise<{
  invite: Invite;
  company: Company | null;
} | null> {
  // API works signed-out and returns a company summary via Admin SDK.
  try {
    const res = await fetch(`/api/invites/${encodeURIComponent(token)}`);
    if (res.ok) {
      return (await res.json()) as { invite: Invite; company: Company | null };
    }
  } catch {
    /* fall through */
  }
  if (isFirebaseConfigured()) {
    try {
      return await fetchInviteByToken(token);
    } catch {
      return null;
    }
  }
  return null;
}

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const router = useRouter();
  const { setStore } = useStore();
  const { ready, user, store } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const autoTried = useRef(false);

  useEffect(() => {
    if (!token) {
      setLoadingInvite(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const local = getInviteByToken(store, token);
      if (local) {
        if (!cancelled) setLoadingInvite(false);
        return;
      }
      const remote = await loadInviteRemote(token);
      if (cancelled) return;
      if (remote) {
        setStore(
          persistStore(mergeInviteIntoStore(loadStore(), remote.invite, remote.company)),
        );
      }
      setLoadingInvite(false);
    })();
    return () => {
      cancelled = true;
    };
    // Only re-fetch when token changes; store merge uses latest via setStore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const invite = useMemo(
    () => (token ? getInviteByToken(store, token) : null),
    [store, token],
  );
  const company = useMemo(() => {
    if (!invite) return null;
    const existing = store.companies.find((c) => c.id === invite.companyId);
    if (existing) return existing;
    if (invite.companyName) {
      return {
        id: invite.companyId,
        name: invite.companyName,
        createdAt: invite.createdAt,
        ownerUserId: "",
      } satisfies Company;
    }
    return null;
  }, [store.companies, invite]);
  const emailMatches =
    !!user && !!invite && user.email.toLowerCase() === invite.email.toLowerCase();

  useEffect(() => {
    if (!ready || loadingInvite || !invite || !user || !emailMatches || done || invite.acceptedAt)
      return;
    if (autoTried.current) return;
    autoTried.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = acceptInvite(token);
      setStore(next);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite");
    } finally {
      setBusy(false);
    }
  }, [ready, loadingInvite, invite, user, emailMatches, done, token, setStore]);

  function onAccept() {
    setBusy(true);
    setError(null);
    try {
      const next = acceptInvite(token);
      setStore(next);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || loadingInvite) {
    return (
      <main className="auth-wrap shell">
        <div className="panel auth-card stack">
          <p className="muted">Loading…</p>
        </div>
      </main>
    );
  }

  if (!invite || !company) {
    return (
      <main className="auth-wrap shell">
        <div className="panel auth-card stack">
          <AuthBrand />
          <h1>Invite unavailable</h1>
          <p className="muted">
            This invite link is invalid or was revoked. Ask your admin for a new one.
          </p>
          <Link className="btn" href="/login">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const nextPath = `/invite/${token}`;
  const authQuery = `?email=${encodeURIComponent(invite.email)}&next=${encodeURIComponent(nextPath)}`;
  const membership = user
    ? membershipsForUser(store, user.id).find((m) => m.companyId === invite.companyId)
    : null;
  const isExpert = membership && !membership.newHire;
  const forNewHire = Boolean(invite.newHire || membership?.newHire);

  if (done || invite.acceptedAt) {
    return (
      <main className="auth-wrap shell">
        <div className="panel auth-card stack">
          <AuthBrand tag={company.name} />
          <h1>You&apos;re on the team</h1>
          <p className="muted">
            Recordings and lessons for this account go to <strong>{company.name}</strong> — bound by
            this invite, not your email domain.
          </p>
          {isExpert ? (
            <>
              <p className="muted">
                Open Workspace to record Work Maps, debrief, and publish — or Learn for your plan.
              </p>
              <div className="admin-invite-actions">
                <Link className="btn btn-primary" href="/app">
                  Open Workspace
                </Link>
                <Link className="btn" href="/learn">
                  Open Learn
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="muted">Open Learn for your guided plan in the browser.</p>
              <div className="admin-invite-actions">
                <Link className="btn btn-primary" href="/learn">
                  Open your plan
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="auth-wrap shell">
      <div className="panel auth-card stack">
        <AuthBrand tag={`Invite · ${company.name}`} />
        <h1>Join {company.name}</h1>
        <p className="muted">
          This invite is for <strong>{invite.email}</strong>
          {invite.name ? ` (${invite.name})` : ""}. Personal inboxes are fine — the invite, not the
          domain, picks the company bank.
        </p>
        {isFirebaseConfigured() ? (
          <p className="muted">
            Sign in with <strong>{invite.email}</strong> (Google or email/password) to accept.
          </p>
        ) : null}

        <ol className="invite-steps">
          <li>
            <strong>Sign in with this email</strong>
            <span className="muted">Then accept the invite below.</span>
          </li>
          <li>
            <strong>{forNewHire ? "Open your learning plan" : "Open Workspace"}</strong>
            <span className="muted">
              {forNewHire
                ? "Learn runs in the Mira web app — no extension required."
                : "Record and publish Work Maps in the browser while the Chrome extension awaits approval."}
            </span>
          </li>
        </ol>

        {!user ? (
          <div className="admin-invite-actions">
            <Link className="btn btn-primary" href={`/login${authQuery}`}>
              Sign in to accept
            </Link>
            <Link className="btn" href={`/signup${authQuery}`}>
              Create account
            </Link>
          </div>
        ) : !emailMatches ? (
          <>
            <p className="error">
              You&apos;re signed in as {user.email}. Sign in as {invite.email} to accept this invite.
            </p>
            <div className="admin-invite-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  void (async () => {
                    await signOutFirebase();
                    setStore(logout());
                    router.push(`/login${authQuery}`);
                  })();
                }}
              >
                Switch account
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">Signed in as {user.email}.</p>
            {error ? <p className="error">{error}</p> : null}
            <button className="btn btn-primary" type="button" disabled={busy} onClick={onAccept}>
              {busy ? "Joining…" : `Join ${company.name}`}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
