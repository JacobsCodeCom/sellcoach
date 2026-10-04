"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { AuthBrand } from "@/components/AuthBrand";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { humanizeAuthError, signInWithGoogle, signUpWithEmail } from "@/lib/firebase/auth";
import { completeAuthSession } from "@/lib/firebase/session";
import {
  activeMembership,
  getActiveCompany,
  getSessionUser,
  homePathForSession,
  membershipsForUser,
  signup,
} from "@/lib/repo";
import { useStore } from "@/lib/store";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setStore } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const prefillEmail = params.get("email") ?? "";
  const next = params.get("next");
  const invited = Boolean(next?.startsWith("/invite/"));
  const firebase = isFirebaseConfigured();

  async function finish(store: ReturnType<typeof signup>) {
    setStore(store);
    if (next && next.startsWith("/")) {
      router.push(next);
      return;
    }
    const user = getSessionUser(store);
    const memberships = user ? membershipsForUser(store, user.id) : [];
    if (!memberships.length) {
      router.push("/onboarding");
      return;
    }
    router.push(
      homePathForSession({
        user,
        company: getActiveCompany(store),
        membership: activeMembership(store),
      }),
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") || "");
    const email = String(data.get("email") || "");
    const password = String(data.get("password") || "");
    try {
      if (firebase) {
        const fbUser = await signUpWithEmail(name, email, password);
        await finish(await completeAuthSession(fbUser));
      } else {
        await finish(signup(name, email, password));
      }
    } catch (err) {
      setError(humanizeAuthError(err, "Could not sign up"));
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
      setError(humanizeAuthError(err, "Could not continue with Google"));
    } finally {
      setBusy(false);
    }
  }

  const loginHref = next
    ? `/login?email=${encodeURIComponent(prefillEmail)}&next=${encodeURIComponent(next)}`
    : prefillEmail
      ? `/login?email=${encodeURIComponent(prefillEmail)}`
      : "/login";

  return (
    <main className="auth-wrap shell">
      <div className="panel auth-card stack">
        <div>
          <AuthBrand />
          <h1>Create account</h1>
          <p className="muted">
            {invited
              ? "After signup you’ll accept your company invite, then learn and record in the Mira web app."
              : "Next, a short setup chat will create your company and core roles."}
          </p>
        </div>
        {firebase ? (
          <button className="btn" type="button" disabled={busy} onClick={() => void onGoogle()}>
            Continue with Google
          </button>
        ) : null}
        <form className="stack" onSubmit={(e) => void onSubmit(e)}>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" required autoComplete="name" />
          </div>
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
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Continue"}
          </button>
        </form>
        <p className="muted">
          Already have an account? <Link href={loginHref}>Sign in</Link>
        </p>
      </div>
    </main>
  );
}
