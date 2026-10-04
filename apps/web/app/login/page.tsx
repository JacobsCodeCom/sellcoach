"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { AuthBrand } from "@/components/AuthBrand";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { humanizeAuthError, signInWithEmail, signInWithGoogle } from "@/lib/firebase/auth";
import { completeAuthSession } from "@/lib/firebase/session";
import {
  getActiveCompany,
  getSessionUser,
  homePathForSession,
  login,
  activeMembership,
} from "@/lib/repo";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setStore } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const prefillEmail = params.get("email") ?? "";
  const next = params.get("next");
  const firebase = isFirebaseConfigured();

  async function finish(store: ReturnType<typeof login>) {
    setStore(store);
    if (next && next.startsWith("/")) {
      router.push(next);
      return;
    }
    const user = getSessionUser(store);
    const company = getActiveCompany(store);
    const membership = activeMembership(store);
    router.push(homePathForSession({ user, company, membership }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") || "");
    const password = String(data.get("password") || "");
    try {
      if (firebase) {
        const fbUser = await signInWithEmail(email, password);
        await finish(await completeAuthSession(fbUser));
      } else {
        await finish(login(email, password));
      }
    } catch (err) {
      setError(humanizeAuthError(err, "Could not sign in"));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setBusy(true);
    try {
      const fbUser = await signInWithGoogle();
      await finish(await completeAuthSession(fbUser));
    } catch (err) {
      setError(humanizeAuthError(err, "Could not sign in with Google"));
    } finally {
      setBusy(false);
    }
  }

  const signupHref = next
    ? `/signup?email=${encodeURIComponent(prefillEmail)}&next=${encodeURIComponent(next)}`
    : prefillEmail
      ? `/signup?email=${encodeURIComponent(prefillEmail)}`
      : "/signup";

  return (
    <main className="auth-wrap shell">
      <div className="panel auth-card stack">
        <div>
          <AuthBrand />
          <h1>Sign in</h1>
          <p className="muted">
            {firebase
              ? "Use Google or the email for your Mira account."
              : "Local auth stub — any password works until Firebase env vars are set."}
          </p>
        </div>
        {firebase ? (
          <button className="btn" type="button" disabled={busy} onClick={() => void onGoogle()}>
            Continue with Google
          </button>
        ) : null}
        <form className="stack" onSubmit={(e) => void onSubmit(e)}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={prefillEmail}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Continue"}
          </button>
        </form>
        <p className="muted">
          New here? <Link href={signupHref}>Create an account</Link>
        </p>
      </div>
    </main>
  );
}
