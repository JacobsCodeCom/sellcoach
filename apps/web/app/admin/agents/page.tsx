"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createAgent, isOnboardingComplete } from "@/lib/repo";
import { useSession, useStore } from "@/lib/store";

export default function AgentsPage() {
  const router = useRouter();
  const { setStore } = useStore();
  const { ready, user, company, membership, store } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/");
    else if (!company) router.replace("/onboarding");
    else if (!isOnboardingComplete(company)) router.replace("/onboarding");
    else if (membership?.platformRole !== "owner") {
      router.replace(membership?.newHire ? "/learn" : "/app");
    }
  }, [ready, user, company, membership, router]);

  const roles = useMemo(
    () => store.workRoles.filter((r) => r.companyId === company?.id),
    [store.workRoles, company?.id],
  );
  const agents = useMemo(
    () =>
      store.agents
        .filter((a) => a.companyId === company?.id)
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt),
    [store.agents, company?.id],
  );

  function onCreateAgent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const companyId = company?.id;
    if (!companyId) return;
    const data = new FormData(e.currentTarget);
    try {
      const next = createAgent({
        name: String(data.get("name") || ""),
        brief: String(data.get("brief") || ""),
        workRoleId: null,
        status: "draft",
      });
      setStore(next);
      const created = next.agents
        .filter((a) => a.companyId === companyId)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      e.currentTarget.reset();
      if (created) router.push(`/admin/agents/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create agent");
    }
  }

  if (
    !ready ||
    !user ||
    !company ||
    !isOnboardingComplete(company) ||
    membership?.platformRole !== "owner"
  ) {
    return <p className="muted">Loading…</p>;
  }

  return (
    <>
      <div className="admin-section-head">
        <div>
          <h2>Agents</h2>
          <p className="muted admin-meta">Attach Work Map abilities to agents</p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            setCreating((v) => !v);
            setError(null);
          }}
        >
          {creating ? "Cancel" : "New agent"}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {creating ? (
        <form className="panel stack admin-drawer" onSubmit={onCreateAgent}>
          <div className="admin-form-grid">
            <div className="field">
              <label htmlFor="agentName">Name</label>
              <input
                id="agentName"
                name="name"
                required
                autoFocus
                placeholder="Invoice exception agent"
              />
            </div>
            <div className="field">
              <label htmlFor="agentBrief">Brief (optional)</label>
              <input
                id="agentBrief"
                name="brief"
                placeholder="Handles AP exceptions the way the expert showed"
              />
            </div>
          </div>
          <div className="admin-drawer-actions">
            <button className="btn btn-primary" type="submit">
              Create agent
            </button>
          </div>
        </form>
      ) : null}

      <div className="panel stack">
        <ul className="list">
          {agents.map((agent) => {
            const role = roles.find((r) => r.id === agent.workRoleId);
            const abilityCount = store.abilities.filter((a) => a.agentId === agent.id).length;
            return (
              <li key={agent.id}>
                <div>
                  <strong>{agent.name}</strong>
                  <span className="tag" style={{ marginLeft: "0.5rem" }}>
                    {agent.status}
                  </span>
                  <div className="muted">
                    {abilityCount} abilit{abilityCount === 1 ? "y" : "ies"}
                    {role ? ` · ${role.title}` : ""}
                    {agent.brief ? ` · ${agent.brief}` : ""}
                  </div>
                </div>
                <Link className="btn btn-primary" href={`/admin/agents/${agent.id}`}>
                  Open
                </Link>
              </li>
            );
          })}
          {!agents.length ? (
            <li className="muted">No agents yet — create one to attach Work Map abilities.</li>
          ) : null}
        </ul>
      </div>
    </>
  );
}
