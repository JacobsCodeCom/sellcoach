"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { membershipsForUser, getSessionUser, signup } from "@/lib/repo";
import { useStore } from "@/lib/store";

export default function SignupPage() {
  const router = useRouter();
  const { setStore } = useStore();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") || "");
    const email = String(data.get("email") || "");
    const password = String(data.get("password") || "");
    try {
      const store = signup(name, email, password);
      setStore(store);
      const user = getSessionUser(store);
      const memberships = user ? membershipsForUser(store, user.id) : [];
      if (!memberships.length) router.push("/onboarding");
      else router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign up");
    }
  }

  return (
    <main className="auth-wrap shell">
      <div className="panel auth-card stack">
        <div>
          <p className="tag">Mira</p>
          <h1>Create account</h1>
          <p className="muted">Next, a short setup chat will create your company and core roles.</p>
        </div>
        <form className="stack" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" required autoComplete="name" />
          </div>
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
              autoComplete="new-password"
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn btn-primary" type="submit">
            Continue
          </button>
        </form>
        <p className="muted">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
