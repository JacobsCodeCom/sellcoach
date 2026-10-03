"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/repo";
import { useSession, useStore } from "@/lib/store";

export function AppNav() {
  const router = useRouter();
  const { setStore } = useStore();
  const { ready, user, company, membership } = useSession();

  return (
    <header className="shell topnav">
      <Link href="/" className="brand">
        Mira
      </Link>
      <nav className="nav-links" style={ready ? undefined : { visibility: "hidden" }}>
        {user ? (
          <>
            {membership?.platformRole === "owner" ? (
              <>
                <Link href="/admin">Admin</Link>
                <Link href="/getting-started">Guide</Link>
              </>
            ) : null}
            {!membership?.newHire ? (
              <>
                <Link href="/app">Workspace</Link>
                <span className="tag">{company?.name ?? "No company"}</span>
              </>
            ) : null}
            <button
              className="btn-ghost"
              type="button"
              onClick={() => {
                setStore(logout());
                router.push("/");
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <a href="/#how">How it works</a>
            <a href="/#examples">Product</a>
            <Link href="/login">Sign in</Link>
            <Link className="btn btn-primary" href="/signup">
              Get started
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
