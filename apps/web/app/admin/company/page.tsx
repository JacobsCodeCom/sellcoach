"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Competence } from "@mira/core";
import { NotionIntegrationsPanel } from "@/components/NotionIntegrationsPanel";
import {
  createWorkRole,
  deleteWorkRole,
  isOnboardingComplete,
  updateCompanyProfile,
  updateWorkRole,
} from "@/lib/repo";
import { useSession, useStore } from "@/lib/store";

export default function CompanySettingsPage() {
  const router = useRouter();
  const { setStore } = useStore();
  const { ready, user, company, membership, store } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [removingRoleId, setRemovingRoleId] = useState<string | null>(null);

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
    () =>
      store.workRoles
        .filter((r) => r.companyId === company?.id)
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title)),
    [store.workRoles, company?.id],
  );

  const roleImpact = useMemo(() => {
    if (!company || !removingRoleId) return null;
    const members = store.memberships
      .filter((m) => m.companyId === company.id && m.workRoleId === removingRoleId)
      .map((m) => store.users.find((u) => u.id === m.userId)?.name ?? "Unknown");
    const inviteCount = store.invites.filter(
      (i) => i.companyId === company.id && i.workRoleId === removingRoleId && !i.revokedAt,
    ).length;
    const agentCount = store.agents.filter(
      (a) => a.companyId === company.id && a.workRoleId === removingRoleId,
    ).length;
    return { members, inviteCount, agentCount };
  }, [company, removingRoleId, store.memberships, store.users, store.invites, store.agents]);

  function memberCountForRole(roleId: string) {
    if (!company) return 0;
    return store.memberships.filter((m) => m.companyId === company.id && m.workRoleId === roleId)
      .length;
  }

  function onSaveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const data = new FormData(e.currentTarget);
    try {
      setStore(
        updateCompanyProfile({
          name: String(data.get("name") || ""),
          summary: String(data.get("summary") || ""),
          ownerIsExpert: data.get("ownerIsExpert") === "on",
        }),
      );
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save company");
    }
  }

  function onCreateRole(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
      setStore(
        createWorkRole({
          title: String(data.get("roleTitle") || ""),
          seniority: Number(data.get("seniority") || 1),
          competence: String(data.get("competence") || "junior") as Competence,
        }),
      );
      e.currentTarget.reset();
      setCreatingRole(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create role");
    }
  }

  function onUpdateRole(e: FormEvent<HTMLFormElement>, roleId: string) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
      setStore(
        updateWorkRole(roleId, {
          title: String(data.get("roleTitle") || ""),
          seniority: Number(data.get("seniority") || 1),
          competence: String(data.get("competence") || "junior") as Competence,
        }),
      );
      setEditingRoleId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update role");
    }
  }

  function onConfirmRemove(roleId: string) {
    setError(null);
    try {
      setStore(deleteWorkRole(roleId));
      setRemovingRoleId(null);
      if (editingRoleId === roleId) setEditingRoleId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove role");
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
          <h2>Company</h2>
          <p className="muted admin-meta">Name, roles, and integrations</p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <form className="panel stack admin-company-form" onSubmit={onSaveProfile}>
        <div className="admin-drawer-head">
          <h3>Profile</h3>
        </div>
        <div className="field">
          <label htmlFor="companyName">Name</label>
          <input
            id="companyName"
            name="name"
            required
            defaultValue={company.name}
            key={`name-${company.name}`}
          />
        </div>
        <div className="field">
          <label htmlFor="companySummary">Summary</label>
          <input
            id="companySummary"
            name="summary"
            placeholder="What your company does"
            defaultValue={company.summary ?? ""}
            key={`summary-${company.summary ?? ""}`}
          />
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            name="ownerIsExpert"
            defaultChecked={Boolean(company.ownerIsExpert)}
            key={`expert-${company.ownerIsExpert ? "1" : "0"}`}
          />
          <span>I capture as the expert (solo founder)</span>
        </label>
        <div className="admin-drawer-actions">
          <button className="btn btn-primary" type="submit">
            {saved ? "Saved" : "Save changes"}
          </button>
        </div>
      </form>

      <div className="panel stack admin-roles-panel" id="roles">
        <div className="admin-drawer-head admin-roles-head">
          <div>
            <h3>Roles</h3>
            <p className="muted">Work roles used for roadmaps and assignments</p>
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setCreatingRole((v) => !v);
              setEditingRoleId(null);
              setRemovingRoleId(null);
              setError(null);
            }}
          >
            {creatingRole ? "Cancel" : "Add role"}
          </button>
        </div>

        {creatingRole ? (
          <form className="stack" onSubmit={onCreateRole}>
            <div className="admin-form-grid">
              <div className="field">
                <label htmlFor="roleTitle">Job title</label>
                <input id="roleTitle" name="roleTitle" required autoFocus placeholder="Customer success" />
              </div>
              <div className="field">
                <label htmlFor="seniority">Seniority</label>
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
            </div>
            <div className="admin-drawer-actions">
              <button className="btn btn-primary" type="submit">
                Create role
              </button>
            </div>
          </form>
        ) : null}

        {!roles.length ? (
          <p className="muted">No roles yet — add one or create them when inviting people.</p>
        ) : (
          <ul className="admin-roles-list">
            {roles.map((role) => {
              const count = memberCountForRole(role.id);
              const isEditing = editingRoleId === role.id;
              const isRemoving = removingRoleId === role.id;

              return (
                <li key={role.id} className={isEditing || isRemoving ? "is-open" : undefined}>
                  <div className="admin-role-row">
                    <div className="admin-role-meta">
                      <strong>{role.title}</strong>
                      <span className="muted">
                        {role.competence} · L{role.seniority}
                      </span>
                      <span className="muted admin-role-count">
                        {count === 0 ? "No people" : count === 1 ? "1 person" : `${count} people`}
                      </span>
                    </div>
                    <div className="admin-role-actions">
                      <button
                        className="admin-link"
                        type="button"
                        onClick={() => {
                          setError(null);
                          setCreatingRole(false);
                          setRemovingRoleId(null);
                          setEditingRoleId((current) => (current === role.id ? null : role.id));
                        }}
                      >
                        {isEditing ? "Cancel" : "Edit"}
                      </button>
                      <button
                        className="admin-link admin-link-danger"
                        type="button"
                        onClick={() => {
                          setError(null);
                          setCreatingRole(false);
                          setEditingRoleId(null);
                          setRemovingRoleId((current) => (current === role.id ? null : role.id));
                        }}
                      >
                        {isRemoving ? "Cancel" : "Remove"}
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <form className="stack admin-role-edit" onSubmit={(e) => onUpdateRole(e, role.id)}>
                      <div className="admin-form-grid">
                        <div className="field">
                          <label htmlFor={`edit-title-${role.id}`}>Job title</label>
                          <input
                            id={`edit-title-${role.id}`}
                            name="roleTitle"
                            required
                            autoFocus
                            defaultValue={role.title}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`edit-seniority-${role.id}`}>Seniority</label>
                          <input
                            id={`edit-seniority-${role.id}`}
                            name="seniority"
                            type="number"
                            min={1}
                            defaultValue={role.seniority}
                            required
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`edit-competence-${role.id}`}>Competence</label>
                          <select
                            id={`edit-competence-${role.id}`}
                            name="competence"
                            defaultValue={role.competence}
                          >
                            <option value="junior">Junior</option>
                            <option value="mid">Mid</option>
                            <option value="expert">Expert</option>
                          </select>
                        </div>
                      </div>
                      <div className="admin-drawer-actions">
                        <button className="btn btn-primary" type="submit">
                          Save role
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {isRemoving && roleImpact ? (
                    <div className="admin-role-confirm">
                      <p>
                        Remove <strong>{role.title}</strong>?
                        {roleImpact.members.length > 0 ? (
                          <>
                            {" "}
                            This will unassign{" "}
                            {roleImpact.members.length === 1
                              ? roleImpact.members[0]
                              : `${roleImpact.members.length} people`}{" "}
                            and flag them as needing a role
                            {roleImpact.members.length > 1
                              ? `: ${roleImpact.members.join(", ")}`
                              : ""}
                            .
                          </>
                        ) : (
                          <> No one is currently assigned to this role.</>
                        )}
                        {roleImpact.inviteCount > 0 || roleImpact.agentCount > 0 ? (
                          <>
                            {" "}
                            Pending invites and agents using this role will be cleared.
                          </>
                        ) : null}
                      </p>
                      <div className="admin-drawer-actions">
                        <button
                          className="btn"
                          type="button"
                          onClick={() => setRemovingRoleId(null)}
                        >
                          Keep role
                        </button>
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() => onConfirmRemove(role.id)}
                        >
                          Remove role
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="admin-integrations-block" id="integrations">
        <div className="admin-drawer-head">
          <h3>Integrations</h3>
          <p className="muted">Connect Notion to import people and structure</p>
        </div>
        <NotionIntegrationsPanel store={store} companyId={company.id} setStore={setStore} />
      </div>
    </>
  );
}
