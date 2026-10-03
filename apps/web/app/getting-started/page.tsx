"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { isOnboardingComplete } from "@/lib/repo";
import { useSession } from "@/lib/store";

export default function GettingStartedPage() {
  const router = useRouter();
  const { ready, user, company, membership, store } = useSession();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!company) {
      router.replace("/onboarding");
      return;
    }
    if (!isOnboardingComplete(company)) {
      router.replace("/onboarding");
      return;
    }
    if (membership?.platformRole !== "owner") {
      router.replace("/app");
    }
  }, [ready, user, company, membership, router]);

  if (!ready || !user || !company || !isOnboardingComplete(company) || membership?.platformRole !== "owner") {
    return (
      <main className="shell">
        <AppNav />
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const roles = store.workRoles.filter((r) => r.companyId === company.id);
  const people = store.memberships.filter((m) => m.companyId === company.id).length;

  return (
    <main>
      <AppNav />
      <section className="shell" style={{ paddingBottom: "4rem" }}>
        <div className="page-head">
          <div>
            <p className="tag">You&apos;re in · {company.name}</p>
            <h1>How to keep going</h1>
            <p className="muted" style={{ margin: "0.5rem 0 0", maxWidth: "48ch" }}>
              Essentials are set{company.summary ? ` — ${company.summary}` : ""}.{" "}
              {roles.length} roles · {people} people. Here&apos;s the loop from here.
            </p>
          </div>
        </div>

        <div className="flow" style={{ marginBottom: "2rem" }}>
          <article>
            <strong>1. Add more people in Admin</strong>
            <p>
              Invite teammates and assign work roles. Same title + lower seniority unlocks lessons
              from more senior / higher-competence seats.
            </p>
          </article>
          <article>
            <strong>2. Experts capture in Workspace</strong>
            <p>
              Mid and expert people (or seniority 3+) record how work is actually done. Teach-backs
              become lessons automatically.
            </p>
          </article>
          <article>
            <strong>3. Hires follow the roadmap</strong>
            <p>
              Matching roles pull those lessons into a living roadmap — it updates when new capture
              lands.
            </p>
          </article>
        </div>

        <div className="grid-2">
          <div className="panel stack">
            <h3>Next in Admin</h3>
            <ul className="list">
              <li>
                <div>
                  <strong>Add members</strong>
                  <div className="muted">Name, email, and a work role — roadmaps regenerate on save.</div>
                </div>
              </li>
              <li>
                <div>
                  <strong>Tune roles</strong>
                  <div className="muted">
                    Title, seniority, and competence are the matching keys — not a course catalog.
                  </div>
                </div>
              </li>
              <li>
                <div>
                  <strong>Watch the lesson pool</strong>
                  <div className="muted">Filled by expert capture, not by uploading generic content.</div>
                </div>
              </li>
            </ul>
            <Link className="btn btn-primary" href="/admin">
              Open company admin
            </Link>
          </div>

          <div className="panel stack">
            <h3>Next in Workspace</h3>
            <ul className="list">
              <li>
                <div>
                  <strong>If you&apos;re an expert seat</strong>
                  <div className="muted">Start a capture and teach the rules you actually use.</div>
                </div>
              </li>
              <li>
                <div>
                  <strong>If you&apos;re training</strong>
                  <div className="muted">Open your roadmap and work lessons as they unlock.</div>
                </div>
              </li>
              <li>
                <div>
                  <strong>Switch accounts to test</strong>
                  <div className="muted">
                    Sign in as an expert you added (same password stub) to try capture.
                  </div>
                </div>
              </li>
            </ul>
            <Link className="btn" href="/app">
              Open workspace
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
