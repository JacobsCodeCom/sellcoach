"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutFirebase } from "@/lib/firebase/auth";
import { clearSessionUserId, homePathForSession } from "@/lib/repo";
import { useSession } from "@/lib/store";

function navActive(pathname: string, href: string, opts?: { exact?: boolean }) {
  if (opts?.exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname();
  const { ready, user, company, membership } = useSession();

  const isOwner = membership?.platformRole === "owner";
  const showWorkspace = Boolean(user && !membership?.newHire);
  const showLearn = Boolean(user && membership);
  const homeHref = user
    ? homePathForSession({ user, company, membership })
    : "/";

  return (
    <header className="topnav">
      <div className="shell topnav-inner">
        <div className="topnav-brand">
          <Link href={homeHref} className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="brand-mark"
              src="/brand/mira-mark.svg"
              alt=""
              width={22}
              height={22}
              aria-hidden
            />
            Mira
          </Link>
          {user && company?.name ? (
            isOwner ? (
              <Link className="nav-org" href="/admin/company" title={`${company.name} settings`}>
                {company.name}
              </Link>
            ) : (
              <span className="nav-org" title={company.name}>
                {company.name}
              </span>
            )
          ) : null}
        </div>

        <nav className="nav-links" style={ready ? undefined : { visibility: "hidden" }}>
          {user ? (
            showLearn || isOwner || showWorkspace ? (
              <div className="nav-cluster">
                {showLearn ? (
                  <Link
                    href="/learn"
                    className={navActive(pathname, "/learn") ? "is-active" : undefined}
                  >
                    Learn
                  </Link>
                ) : null}
                {showWorkspace ? (
                  <Link
                    href="/app"
                    className={navActive(pathname, "/app") ? "is-active" : undefined}
                  >
                    Workspace
                  </Link>
                ) : null}
                {isOwner ? (
                  <Link
                    href="/admin"
                    className={navActive(pathname, "/admin") ? "is-active" : undefined}
                  >
                    Admin
                  </Link>
                ) : null}
              </div>
            ) : null
          ) : (
            <div className="nav-cluster">
              <a href="/#how">How it works</a>
              <a href="/#examples">Product</a>
              <a href="/#integrations">Integrations</a>
            </div>
          )}
        </nav>

        <div className="nav-actions" style={ready ? undefined : { visibility: "hidden" }}>
          {user ? (
            <button
              className="btn-ghost nav-signout"
              type="button"
              onClick={() => {
                void (async () => {
                  await signOutFirebase();
                  clearSessionUserId();
                  // Hard navigate so in-page auth guards can't race us to /login.
                  window.location.assign("/");
                })();
              }}
            >
              Sign out
            </button>
          ) : (
            <>
              <Link href="/login" className="nav-signin">
                Sign in
              </Link>
              <Link className="btn btn-primary nav-cta" href="/signup">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
