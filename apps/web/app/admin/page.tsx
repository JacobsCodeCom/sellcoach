"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Competence } from "@mira/core";
import { AppNav } from "@/components/AppNav";
import { OnboardingChat } from "@/components/OnboardingChat";
import {
  assignWorkRole,
  createMemberAccount,
  createWorkRole,
  getRoadmapForMembership,
  isOnboardingComplete,
  removeMember,
  setMemberNewHire,
  signInAsMember,
} from "@/lib/repo";
import { useSession, useStore } from "@/lib/store";

export default function AdminPage() {
  const router = useRouter();
  const { setStore } = useStore();
  const { ready, user, company, membership, store } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (!company) router.replace("/onboarding");
    else if (!isOnboardingComplete(company)) router.replace("/onboarding");
    else if (membership?.platformRole !== "owner") router.replace("/app");
  }, [ready, user, company, membership, router]);

  const roles = useMemo(
    () => store.workRoles.filter((r) => r.companyId === company?.id),
    [store.workRoles, company?.id],
  );
  const members = useMemo(
    () => store.memberships.filter((m) => m.companyId === company?.id),
    [store.memberships, company?.id],
  );
  const lessons = useMemo(
    () => store.lessons.filter((l) => l.companyId === company?.id),
    [store.lessons, company?.id],
  );

  function onCreateRole(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
      setStore(
        createWorkRole({
          title: String(data.get("title") || ""),
          seniority: Number(data.get("seniority") || 1),
          competence: String(data.get("competence") || "junior") as Competence,
        }),
      );
      e.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create role");
    }
  }

  function onCreateMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const workRoleId = String(data.get("workRoleId") || "");
    try {
      setStore(
        createMemberAccount({
          name: String(data.get("name") || ""),
          email: String(data.get("email") || ""),
          workRoleId: workRoleId || null,
          platformRole: "member",
          newHire: data.get("newHire") === "on",
        }),
      );
      e.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create member");
    }
  }

  if (
    !ready ||
    !user ||
    !company ||
    !isOnboardingComplete(company) ||
    membership?.platformRole !== "owner"
  ) {
    return (
      <main className="shell">
        <AppNav />
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main>
      <AppNav />
      <section className="shell" style={{ paddingBottom: "4rem" }}>
        <div className="page-head">
          <div>
            <p className="tag">Owner · {company.name}</p>
            <h1>Company admin</h1>
            <p className="muted" style={{ margin: "0.45rem 0 0" }}>
              <Link href="/getting-started" style={{ color: "inherit", textDecoration: "underline" }}>
                How this app works
              </Link>
            </p>
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="panel stack admin-agent">
          <h3>Team agent</h3>
          <p className="muted">
            Tell Mira who to add or change, e.g. “Add Sara Lind, sara@acme.com, new hire in
            Operations” or “Make Ben a senior.”
          </p>
          <OnboardingChat mode="manage" />
        </div>

        <div className="grid-2">
          <div className="stack">
            <form className="panel stack" onSubmit={onCreateRole}>
              <h3>Work roles</h3>
              <p className="muted">
                Title, seniority, and competence decide which expert lessons attach to each hire.
              </p>
              <div className="field">
                <label htmlFor="title">Job title</label>
                <input id="title" name="title" required placeholder="Customer success" />
              </div>
              <div className="field">
                <label htmlFor="seniority">Seniority (number)</label>
                <input id="seniority" name="seniority" type="number" min={1} defaultValue={1} required />
              </div>
              <div className="field">
                <label htmlFor="competence">Competence</label>
                <select id="competence" name="competence" defaultValue="junior">
                  <option value="junior">Junior</option>
                  <option value="mid">Mid</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
              <button className="btn btn-primary" type="submit">
                Add role
              </button>
              <ul className="list">
                {roles.map((role) => (
                  <li key={role.id}>
                    <div>
                      <strong>{role.title}</strong>
                      <div className="muted">
                        Seniority {role.seniority} · {role.competence}
                      </div>
                    </div>
                  </li>
                ))}
                {!roles.length ? <li className="muted">No roles yet</li> : null}
              </ul>
            </form>

            <form className="panel stack" onSubmit={onCreateMember}>
              <h3>Members</h3>
              <p className="muted">Create accounts and attach a work role. Roadmaps regenerate on save.</p>
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" name="name" required />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" required />
              </div>
              <div className="field">
                <label htmlFor="workRoleId">Work role</label>
                <select id="workRoleId" name="workRoleId" defaultValue="">
                  <option value="">Unassigned</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.title} · {role.competence} (L{role.seniority})
                    </option>
                  ))}
                </select>
              </div>
              <label className="check-field">
                <input type="checkbox" name="newHire" />
                <span>
                  New hire to onboard
                  <em className="muted"> · simple lessons app, no recording</em>
                </span>
              </label>
              <button className="btn btn-primary" type="submit">
                Add member
              </button>
            </form>
          </div>

          <div className="stack">
            <div className="panel stack">
              <h3>People</h3>
              <ul className="list">
                {members.map((member) => {
                  const person = store.users.find((u) => u.id === member.userId);
                  const role = roles.find((r) => r.id === member.workRoleId);
                  const roadmap = getRoadmapForMembership(store, member.id);
                  return (
                    <li key={member.id} style={{ alignItems: "flex-start", flexDirection: "column" }}>
                      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                        <div>
                          <strong>{person?.name ?? "Unknown"}</strong>
                          {member.newHire ? <span className="tag tag-hire">New hire</span> : null}
                          <div className="muted">
                            {person?.email} · {member.platformRole}
                          </div>
                        </div>
                        <span className="tag">
                          {roadmap ? `${roadmap.items.filter((i) => i.status === "done").length}/${roadmap.items.length} lessons` : "No roadmap"}
                        </span>
                      </div>
                      <select
                        value={member.workRoleId ?? ""}
                        onChange={(e) => {
                          try {
                            setStore(assignWorkRole(member.id, e.target.value || null));
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Assign failed");
                          }
                        }}
                      >
                        <option value="">Unassigned</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title} · {r.competence} (L{r.seniority})
                          </option>
                        ))}
                      </select>
                      <span className="muted">{role ? `${role.title}` : "No role"}</span>
                      {member.platformRole !== "owner" ? (
                        <div className="member-actions">
                          <button
                            className="btn-text"
                            type="button"
                            onClick={() => setStore(setMemberNewHire(member.id, !member.newHire))}
                          >
                            {member.newHire ? "Mark onboarded" : "Mark as new hire"}
                          </button>
                          <button
                            className="btn-text"
                            type="button"
                            onClick={() => {
                              setStore(signInAsMember(member.id));
                              router.push("/app");
                            }}
                          >
                            View as {person?.name.split(/\s+/)[0]}
                          </button>
                          <button
                            className="btn-text btn-danger-text"
                            type="button"
                            onClick={() => setStore(removeMember(member.id))}
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="panel stack">
              <h3>Company lesson pool</h3>
              <p className="muted">{lessons.length} lessons from expert capture.</p>
              <ul className="list">
                {lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <div>
                      <strong>{lesson.title}</strong>
                      <div className="muted">{lesson.summary}</div>
                    </div>
                  </li>
                ))}
                {!lessons.length ? (
                  <li className="muted">No lessons yet — have an expert capture in Workspace.</li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
