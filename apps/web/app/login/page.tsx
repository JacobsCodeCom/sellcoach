"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  getActiveCompany,
  getSessionUser,
  isOnboardingComplete,
  login,
  membershipsForUser,
} from "@/lib/repo";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const { setStore } = useStore();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") || "");
    const password = String(data.get("password") || "");
    try {
      const store = login(email, password);
      setStore(store);
      const user = getSessionUser(store);
      const memberships = user ? membershipsForUser(store, user.id) : [];
      const company = getActiveCompany(store);
      if (!memberships.length || !company || !isOnboardingComplete(company)) {
        router.push("/onboarding");
      } else if (memberships.some((m) => m.platformRole === "owner")) {
        router.push("/admin");
      } else {
        router.push("/app");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    }
  }

  return (
    <main className="auth-wrap shell">
      <div className="panel auth-card stack">
        <div>
          <p className="tag">Mira</p>
          <h1>Sign in</h1>
          <p className="muted">Local auth stub — any password works for this build.</p>
        </div>
        <form className="stack" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" />
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
          <button className="btn btn-primary" type="submit">
            Continue
          </button>
        </form>
        <p className="muted">
          New here? <Link href="/signup">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
