"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildLearnerPlan, statusLabel, type Competence, type Invite } from "@mira/core";
import { ChromeExtensionLink } from "@/components/ChromeExtensionLink";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { sendInviteEmail } from "@/lib/invites/sendInviteEmail";
import {
  buildPersonAnalytics,
  formatRelativeTime,
  personStatusLabel,
} from "@/lib/adminAnalytics";
import {
  assignWorkRole,
  createMemberInvite,
  createWorkRole,
  extensionInstallBlurb,
  getRoadmapForMembership,
  inviteAbsoluteUrl,
  isOnboardingComplete,
  latestInviteForMembership,
  removeMember,
  setMemberNewHire,
  signInAsMember,
} from "@/lib/repo";
import { useSession, useStore } from "@/lib/store";

type Panel = "none" | "person";

const NEW_ROLE_VALUE = "__new__";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function AdminPeoplePage() {
  const router = useRouter();
  const { setStore } = useStore();
  const { ready, user, company, membership, store } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("none");
  const [openActions, setOpenActions] = useState<string | null>(null);
  const [openRoadmap, setOpenRoadmap] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<Invite | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [roleChoice, setRoleChoice] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);
  const canEmailInvite = isFirebaseConfigured();

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
  const members = useMemo(
    () => store.memberships.filter((m) => m.companyId === company?.id),
    [store.memberships, company?.id],
  );
  const needsRoleMembers = useMemo(
    () =>
      members
        .filter((m) => m.needsRole)
        .map((m) => ({
          membership: m,
          name: store.users.find((u) => u.id === m.userId)?.name ?? "Unknown",
        })),
    [members, store.users],
  );
  const personRows = useMemo(
    () => (company ? buildPersonAnalytics(store, company.id) : []),
    [store, company],
  );
  const personById = useMemo(
    () => new Map(personRows.map((row) => [row.membership.id, row])),
    [personRows],
  );

  function togglePanel(next: Panel) {
    setPanel((current) => (current === next ? "none" : next));
    setError(null);
    if (next !== "person") {
      setRoleChoice("");
      setCreatingRole(false);
    }
  }

  async function markCopied(key: string) {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600);
  }

  async function copyInviteMessage(invite: Invite, key: string) {
    if (!company) return;
    const ok = await copyText(
      extensionInstallBlurb(company.name, inviteAbsoluteUrl(invite.token), {
        newHire: invite.newHire,
      }),
    );
    if (ok) void markCopied(key);
  }

  async function emailInvite(invite: Invite) {
    setError(null);
    setSendingEmail(true);
    try {
      await sendInviteEmail(invite.token);
      void markCopied(`email-${invite.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invite email");
    } finally {
      setSendingEmail(false);
    }
  }

  function onCreateMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    let workRoleId = roleChoice === NEW_ROLE_VALUE ? "" : roleChoice;

    try {
      let nextStore = store;
      if (roleChoice === NEW_ROLE_VALUE) {
        nextStore = createWorkRole({
          title: String(data.get("roleTitle") || ""),
          seniority: Number(data.get("seniority") || 1),
          competence: String(data.get("competence") || "junior") as Competence,
        });
        setStore(nextStore);
        const created = nextStore.workRoles
          .filter((r) => r.companyId === company?.id)
          .sort((a, b) => b.createdAt - a.createdAt)[0];
        workRoleId = created?.id || "";
      }

      const { store: next, invite } = createMemberInvite({
        name: String(data.get("name") || ""),
        email: String(data.get("email") || ""),
        workRoleId: workRoleId || null,
        platformRole: "member",
        newHire: data.get("newHire") === "on",
      });
      setStore(next);
      setCreatedInvite(invite);
      void copyInviteMessage(invite, "created-invite");
      e.currentTarget.reset();
      setRoleChoice("");
      setCreatingRole(false);
      setPanel("none");
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
    return <p className="muted">Loading…</p>;
  }

  const showEmptyTips = members.length < 2;

  return (
    <>
      <div className="admin-section-head">
        <div>
          <h2>People</h2>
          <p className="muted admin-meta">
            {members.length} {members.length === 1 ? "person" : "people"}
          </p>
        </div>
        <div className="admin-head-actions">
          <ChromeExtensionLink className="admin-chip admin-chrome-link" />
          <button className="btn btn-primary" type="button" onClick={() => togglePanel("person")}>
            Add person
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {needsRoleMembers.length > 0 ? (
        <div className="panel stack admin-drawer admin-needs-role-banner">
          <div className="admin-drawer-head">
            <h3>
              {needsRoleMembers.length === 1
                ? "1 person needs a role"
                : `${needsRoleMembers.length} people need a role`}
            </h3>
            <p className="muted">
              Their role was removed. Assign a new one below
              {needsRoleMembers.length <= 6
                ? `: ${needsRoleMembers.map((m) => m.name).join(", ")}`
                : ""}
              .
            </p>
          </div>
        </div>
      ) : null}

      {createdInvite ? (
        <div className="panel stack admin-drawer admin-invite-banner">
          <div className="admin-drawer-head">
            <h3>Invite ready for {createdInvite.name}</h3>
            <p className="muted">
              Send them the invite message — they join in the browser, then open Learn or Workspace.
            </p>
          </div>
          <div className="admin-invite-actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void copyInviteMessage(createdInvite, "created-invite")}
            >
              {copiedKey === "created-invite" ? "Invite copied" : "Copy invite"}
            </button>
            {canEmailInvite ? (
              <button
                className="btn"
                type="button"
                disabled={sendingEmail}
                onClick={() => void emailInvite(createdInvite)}
              >
                {copiedKey === `email-${createdInvite.id}`
                  ? "Email sent"
                  : sendingEmail
                    ? "Sending…"
                    : "Send email"}
              </button>
            ) : null}
            <ChromeExtensionLink className="btn chrome-ext-btn" />
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setCreatedInvite(null)}
            >
              Dismiss
            </button>
          </div>
          {process.env.NODE_ENV === "development" ? (
            <p className="muted admin-invite-hint">
              Local dev: load the unpacked extension from <code>apps/extension</code>, then open the
              invite link while signed in as {createdInvite.email}.
            </p>
          ) : null}
        </div>
      ) : null}

      {panel === "person" ? (
        <form className="panel stack admin-drawer" onSubmit={onCreateMember}>
          <div className="admin-drawer-head">
            <h3>Add person</h3>
          </div>
          <div className="admin-form-grid">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required />
            </div>
            <div className="field">
              <label htmlFor="workRoleId">Work role</label>
              <select
                id="workRoleId"
                name="workRoleId"
                value={roleChoice}
                onChange={(e) => {
                  const value = e.target.value;
                  setRoleChoice(value);
                  setCreatingRole(value === NEW_ROLE_VALUE);
                }}
              >
                <option value="">Unassigned</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.title} · {role.competence} (L{role.seniority})
                  </option>
                ))}
                <option value={NEW_ROLE_VALUE}>Create role…</option>
              </select>
            </div>
          </div>
          {creatingRole ? (
            <div className="admin-form-grid">
              <div className="field">
                <label htmlFor="roleTitle">Job title</label>
                <input id="roleTitle" name="roleTitle" required placeholder="Customer success" />
              </div>
              <div className="field">
                <label htmlFor="seniority">Seniority</label>
                <input
                  id="seniority"
                  name="seniority"
                  type="number"
                  min={1}
                  defaultValue={1}
                  required
                />
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
          ) : null}
          <label className="check-field">
            <input type="checkbox" name="newHire" />
            <span>New hire to onboard</span>
          </label>
          <div className="admin-drawer-actions">
            <button className="btn btn-primary" type="submit">
              Add person
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => togglePanel("none")}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {showEmptyTips ? (
        <p className="muted admin-empty-tips">
          Add people, then have experts record from{" "}
          <Link className="admin-inline-chrome" href="/app">
            Workspace
          </Link>{" "}
          — published maps land on their Learn roadmap.
        </p>
      ) : null}

      <div className="admin-people">
        <div className="admin-people-cols admin-people-cols-rich" aria-hidden>
          <span>Person</span>
          <span>Role</span>
          <span>Progress</span>
          <span>Last active</span>
          <span>Status</span>
          <span />
        </div>
        {!members.length ? (
          <p className="muted admin-people-empty">No people yet — add someone above.</p>
        ) : (
          <ul className="admin-people-list">
            {members.map((member) => {
              const person = store.users.find((u) => u.id === member.userId);
              const analytics = personById.get(member.id);
              const learnerRole =
                store.workRoles.find((r) => r.id === member.workRoleId) ?? null;
              const roadmap = getRoadmapForMembership(store, member.id);
              const plan = buildLearnerPlan({
                roadmap,
                lessons: store.lessons,
                learnerRole,
                memberships: store.memberships,
                users: store.users,
                workRoles: store.workRoles,
              });
              const done = analytics?.done ?? plan.doneCount;
              const total = analytics?.total ?? plan.totalCount;
              const actionsOpen = openActions === member.id;
              const roadmapOpen = openRoadmap === member.id;
              const firstName = person?.name.split(/\s+/)[0] ?? "member";
              const invite = latestInviteForMembership(store, member.id);
              const invitePending = Boolean(
                analytics?.invitePending ?? (invite && !invite.acceptedAt),
              );
              const status =
                analytics?.status ?? (invitePending ? "invite_pending" : "not_started");

              return (
                <li
                  key={member.id}
                  className={`admin-person${actionsOpen || roadmapOpen ? " is-open" : ""}`}
                >
                  <div className="admin-person-main admin-person-main-rich">
                    <div className="admin-person-identity">
                      <div className="admin-person-name">
                        <strong>{person?.name ?? "Unknown"}</strong>
                        {member.platformRole === "owner" ? (
                          <span className="admin-badge">Owner</span>
                        ) : null}
                        {member.platformRole !== "owner" ? (
                          <button
                            className={`admin-badge admin-badge-hire${member.newHire ? "" : " is-off"}`}
                            type="button"
                            title={member.newHire ? "Mark onboarded" : "Mark as new hire"}
                            onClick={() =>
                              setStore(setMemberNewHire(member.id, !member.newHire))
                            }
                          >
                            {member.newHire ? "New hire" : "Set hire"}
                          </button>
                        ) : member.newHire ? (
                          <span className="admin-badge admin-badge-hire">New hire</span>
                        ) : null}
                        {member.needsRole ? (
                          <span className="admin-badge admin-badge-needs-role">Needs role</span>
                        ) : null}
                      </div>
                      <div className="admin-person-email">
                        {person?.email}
                        {analytics?.lastLessonTitle
                          ? ` · Last: ${analytics.lastLessonTitle}`
                          : ""}
                      </div>
                    </div>

                    <label className="admin-person-role">
                      <span className="sr-only">Work role</span>
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
                    </label>

                    <button
                      className={`admin-person-progress admin-person-progress-btn${total > 0 ? "" : " is-empty"}`}
                      type="button"
                      title="Lessons completed / lessons on their roadmap"
                      aria-expanded={roadmapOpen}
                      onClick={() =>
                        setOpenRoadmap((current) => (current === member.id ? null : member.id))
                      }
                    >
                      {total > 0
                        ? `${done}/${total} · ${analytics?.progressPct ?? 0}%`
                        : "—"}
                    </button>

                    <span
                      className="admin-stat admin-stat-muted"
                      title={
                        analytics?.lastLoginAt
                          ? `Last login ${formatRelativeTime(analytics.lastLoginAt)}`
                          : undefined
                      }
                    >
                      {formatRelativeTime(analytics?.lastActiveAt)}
                    </span>

                    <span className={`admin-status admin-status-${status}`}>
                      {personStatusLabel(status)}
                    </span>

                    {member.platformRole !== "owner" ? (
                      <button
                        className="admin-link"
                        type="button"
                        aria-expanded={actionsOpen}
                        onClick={() =>
                          setOpenActions((current) => (current === member.id ? null : member.id))
                        }
                      >
                        {actionsOpen ? "Close" : "More"}
                      </button>
                    ) : (
                      <span className="admin-person-more-spacer" />
                    )}
                  </div>

                  {roadmapOpen ? (
                    total > 0 ? (
                      <ol className="admin-person-roadmap">
                        {plan.rows.map((row) => (
                          <li key={row.lessonId} className="admin-person-roadmap-item">
                            <div className="admin-person-roadmap-top">
                              <span className="admin-person-roadmap-title">
                                {row.order + 1}. {row.title}
                              </span>
                              <span className="admin-person-roadmap-meta">
                                {statusLabel(row.status)}
                                {" · "}
                                {row.estimateMinutes} min
                              </span>
                            </div>
                            <p className="admin-person-roadmap-why">{row.why}</p>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="muted admin-person-roadmap-empty">
                        No lessons matched to this role yet.
                      </p>
                    )
                  ) : null}

                  {actionsOpen && member.platformRole !== "owner" ? (
                    <div className="member-actions">
                      {invite ? (
                        <>
                          <button
                            className="admin-link"
                            type="button"
                            onClick={() => void copyInviteMessage(invite, `invite-${member.id}`)}
                          >
                            {copiedKey === `invite-${member.id}`
                              ? "Invite copied"
                              : "Copy invite"}
                          </button>
                          {canEmailInvite ? (
                            <button
                              className="admin-link"
                              type="button"
                              disabled={sendingEmail}
                              onClick={() => void emailInvite(invite)}
                            >
                              {copiedKey === `email-${invite.id}`
                                ? "Email sent"
                                : sendingEmail
                                  ? "Sending…"
                                  : "Send email"}
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <button
                          className="admin-link"
                          type="button"
                          onClick={() => {
                            if (!person) return;
                            try {
                              const { store: next, invite: fresh } = createMemberInvite({
                                name: person.name,
                                email: person.email,
                                workRoleId: member.workRoleId,
                                platformRole: "member",
                                newHire: !!member.newHire,
                              });
                              setStore(next);
                              setCreatedInvite(fresh);
                              void copyInviteMessage(fresh, "created-invite");
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : "Could not create invite",
                              );
                            }
                          }}
                        >
                          Create invite
                        </button>
                      )}
                      <button
                        className="admin-link"
                        type="button"
                        onClick={() => {
                          setStore(signInAsMember(member.id));
                          router.push("/app");
                        }}
                      >
                        View as {firstName}
                      </button>
                      <button
                        className="admin-link admin-link-danger"
                        type="button"
                        onClick={() => {
                          setStore(removeMember(member.id));
                          setOpenActions(null);
                          setOpenRoadmap((current) => (current === member.id ? null : current));
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
