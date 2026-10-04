"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Competence, ExternalPerson } from "@mira/core";
import {
  applyNotionSync,
  confirmNotionImport,
  connectNotionIntegration,
  disconnectNotionIntegration,
  getNotionConnection,
  regenerateExpertCaptureTasks,
  reassignCaptureTask,
  updateCaptureTaskStatus,
  updateExternalPersonMapping,
  type Store,
} from "@/lib/repo";

type Props = {
  store: Store;
  companyId: string;
  setStore: (store: Store) => void;
  onImported?: () => void;
};

type DbOption = { id: string; title: string };

function effectiveTitle(p: ExternalPerson): string {
  return p.mappedTitle || p.suggestedTitle || p.roleText || "Teammate";
}

function effectiveCompetence(p: ExternalPerson): Competence {
  return p.mappedCompetence || p.suggestedCompetence || "mid";
}

function effectiveSeniority(p: ExternalPerson): number {
  return p.mappedSeniority ?? p.suggestedSeniority ?? 2;
}

function effectiveNewHire(p: ExternalPerson): boolean {
  return p.mappedNewHire ?? p.suggestedNewHire ?? false;
}

export function NotionIntegrationsPanel({ store, companyId, setStore, onImported }: Props) {
  const connection = getNotionConnection(store, companyId);
  const people = useMemo(
    () => store.externalPeople.filter((p) => p.companyId === companyId),
    [store.externalPeople, companyId],
  );
  const tasks = useMemo(
    () => store.captureTasks.filter((t) => t.companyId === companyId),
    [store.captureTasks, companyId],
  );
  const members = useMemo(
    () => store.memberships.filter((m) => m.companyId === companyId),
    [store.memberships, companyId],
  );

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"demo" | "live">(connection?.tokenRef === "demo" ? "demo" : "live");
  const [token, setToken] = useState("");
  const [databases, setDatabases] = useState<DbOption[]>([]);
  const [peopleDatabaseId, setPeopleDatabaseId] = useState(connection?.peopleDatabaseId || "");
  const [knowledgeSourceIds, setKnowledgeSourceIds] = useState(
    (connection?.knowledgeSourceIds || []).join("\n"),
  );
  const [workspaceName, setWorkspaceName] = useState(connection?.workspaceName || "");

  async function connect(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/notion/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "demo" ? { demo: true } : { token: token || undefined }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        workspaceName?: string;
        tokenRef?: string;
      };
      if (!data.ok) throw new Error(data.error || "Connect failed");
      setWorkspaceName(data.workspaceName || "Notion");
      setStore(
        connectNotionIntegration({
          workspaceName: data.workspaceName || "Notion",
          tokenRef: mode === "demo" ? "demo" : data.tokenRef,
        }),
      );

      const dbRes = await fetch("/api/integrations/notion/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "demo" ? { demo: true } : { token: token || undefined }),
      });
      const dbData = (await dbRes.json()) as {
        ok: boolean;
        error?: string;
        databases?: DbOption[];
      };
      if (!dbData.ok) throw new Error(dbData.error || "Could not list databases");
      setDatabases(dbData.databases || []);
      if (!peopleDatabaseId && dbData.databases?.[0]) {
        setPeopleDatabaseId(dbData.databases[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      if (!peopleDatabaseId.trim()) throw new Error("Pick a people database first");
      const knowledgeIds = knowledgeSourceIds
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/integrations/notion/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "demo" || connection?.tokenRef === "demo"
            ? {
                demo: true,
                peopleDatabaseId,
                knowledgeSourceIds: knowledgeIds,
                workspaceName: workspaceName || connection?.workspaceName,
              }
            : {
                token: token || undefined,
                peopleDatabaseId,
                knowledgeSourceIds: knowledgeIds,
                workspaceName: workspaceName || connection?.workspaceName,
              },
        ),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        workspaceName?: string;
        peopleDatabaseId?: string;
        knowledgeSourceIds?: string[];
        people?: Parameters<typeof applyNotionSync>[0]["people"];
        topics?: Parameters<typeof applyNotionSync>[0]["topics"];
      };
      if (!data.ok) throw new Error(data.error || "Sync failed");
      setStore(
        applyNotionSync({
          workspaceName: data.workspaceName,
          peopleDatabaseId: data.peopleDatabaseId,
          knowledgeSourceIds: data.knowledgeSourceIds,
          people: data.people || [],
          topics: data.topics || [],
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  function confirmImport() {
    setError(null);
    try {
      const pending = people.filter((p) => p.adminStatus !== "ignored").map((p) => p.id);
      const next = confirmNotionImport(pending);
      setStore(next);
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/integrations/notion/disconnect", { method: "POST" });
      setStore(disconnectNotionIntegration());
      setDatabases([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel stack admin-drawer">
      <div className="admin-drawer-head">
        <h3>Notion</h3>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {!connection || connection.status === "disconnected" ? (
        <form className="stack" onSubmit={connect}>
          <div className="field">
            <label>Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as "demo" | "live")}>
              <option value="demo">Demo sample company</option>
              <option value="live">Live Notion (integration token)</option>
            </select>
          </div>
          {mode === "live" ? (
            <div className="field">
              <label htmlFor="notion-token">Integration token</label>
              <input
                id="notion-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="secret_…"
                autoComplete="off"
              />
            </div>
          ) : null}
          <div className="admin-drawer-actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Connecting…" : "Connect Notion"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="muted">
            Connected to <strong>{connection.workspaceName}</strong>
            {connection.lastSyncAt
              ? ` · last sync ${new Date(connection.lastSyncAt).toLocaleString()}`
              : ""}
          </p>

          <div className="admin-form-grid">
            <div className="field">
              <label htmlFor="people-db">People database</label>
              {databases.length ? (
                <select
                  id="people-db"
                  value={peopleDatabaseId}
                  onChange={(e) => setPeopleDatabaseId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {databases.map((db) => (
                    <option key={db.id} value={db.id}>
                      {db.title}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="people-db"
                  value={peopleDatabaseId}
                  onChange={(e) => setPeopleDatabaseId(e.target.value)}
                  placeholder="Database id or Notion URL"
                />
              )}
            </div>
            <div className="field">
              <label htmlFor="knowledge-ids">Knowledge pages (optional)</label>
              <textarea
                id="knowledge-ids"
                rows={3}
                value={knowledgeSourceIds}
                onChange={(e) => setKnowledgeSourceIds(e.target.value)}
                placeholder="Playbook page URLs or ids"
              />
            </div>
          </div>

          <div className="admin-drawer-actions">
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void sync()}>
              {busy ? "Syncing…" : "Sync from Notion"}
            </button>
            {!databases.length ? (
              <button className="btn" type="button" disabled={busy} onClick={() => void connect()}>
                Refresh databases
              </button>
            ) : null}
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </button>
          </div>
        </>
      )}

      {people.length ? (
        <div className="stack" style={{ marginTop: "0.5rem" }}>
          <div className="admin-drawer-head">
            <h3>Map people</h3>
          </div>
          <ul className="admin-people-list">
            {people.map((person) => (
              <li key={person.id} className="admin-person" style={{ display: "grid", gap: "0.5rem" }}>
                <div className="admin-person-identity">
                  <div className="admin-person-name">
                    <strong>{person.name}</strong>
                    <span className="tag">{person.adminStatus}</span>
                    {person.area ? <span className="tag">{person.area}</span> : null}
                  </div>
                  <div className="muted">
                    {person.email || "no email"}
                    {person.roleText ? ` · ${person.roleText}` : ""}
                    {person.jobRoles.length ? ` · ${person.jobRoles.join(", ")}` : ""}
                  </div>
                </div>
                {person.adminStatus !== "ignored" ? (
                  <div className="admin-form-grid">
                    <div className="field">
                      <label>Title</label>
                      <input
                        value={effectiveTitle(person)}
                        onChange={(e) =>
                          setStore(
                            updateExternalPersonMapping(person.id, { mappedTitle: e.target.value }),
                          )
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Competence</label>
                      <select
                        value={effectiveCompetence(person)}
                        onChange={(e) =>
                          setStore(
                            updateExternalPersonMapping(person.id, {
                              mappedCompetence: e.target.value as Competence,
                            }),
                          )
                        }
                      >
                        <option value="junior">Junior</option>
                        <option value="mid">Mid</option>
                        <option value="expert">Expert</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Seniority</label>
                      <input
                        type="number"
                        min={1}
                        value={effectiveSeniority(person)}
                        onChange={(e) =>
                          setStore(
                            updateExternalPersonMapping(person.id, {
                              mappedSeniority: Number(e.target.value) || 1,
                            }),
                          )
                        }
                      />
                    </div>
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={effectiveNewHire(person)}
                        onChange={(e) =>
                          setStore(
                            updateExternalPersonMapping(person.id, {
                              mappedNewHire: e.target.checked,
                            }),
                          )
                        }
                      />
                      <span>New hire</span>
                    </label>
                  </div>
                ) : null}
                <div className="member-actions">
                  {person.adminStatus !== "ignored" ? (
                    <button
                      className="btn-text"
                      type="button"
                      onClick={() =>
                        setStore(updateExternalPersonMapping(person.id, { adminStatus: "ignored" }))
                      }
                    >
                      Ignore
                    </button>
                  ) : (
                    <button
                      className="btn-text"
                      type="button"
                      onClick={() =>
                        setStore(updateExternalPersonMapping(person.id, { adminStatus: "pending" }))
                      }
                    >
                      Un-ignore
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="admin-drawer-actions">
            <button className="btn btn-primary" type="button" onClick={confirmImport}>
              Confirm import
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                try {
                  setStore(regenerateExpertCaptureTasks());
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not regenerate tasks");
                }
              }}
            >
              Regenerate tasks
            </button>
          </div>
        </div>
      ) : null}

      {tasks.length ? (
        <div className="stack" style={{ marginTop: "0.75rem" }}>
          <div className="admin-drawer-head">
            <h3>Expert capture tasks</h3>
            <p className="muted">{tasks.filter((t) => t.status === "todo" || t.status === "in_progress").length} open</p>
          </div>
          <ul className="list">
            {tasks.map((task) => {
              const assignee = members.find((m) => m.id === task.assigneeMembershipId);
              const user = store.users.find((u) => u.id === assignee?.userId);
              return (
                <li key={task.id}>
                  <span>
                    <strong>{task.title}</strong>
                    <br />
                    <span className="muted">
                      {user?.name ?? "Unassigned"} · {task.status}
                      <br />
                      {task.brief}
                    </span>
                  </span>
                  <span className="admin-task-actions">
                    <select
                      className="admin-select"
                      aria-label="Assignee"
                      value={task.assigneeMembershipId}
                      onChange={(e) => {
                        try {
                          setStore(reassignCaptureTask(task.id, e.target.value));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Reassign failed");
                        }
                      }}
                    >
                      {members.map((m) => {
                        const u = store.users.find((x) => x.id === m.userId);
                        return (
                          <option key={m.id} value={m.id}>
                            {u?.name ?? m.id}
                          </option>
                        );
                      })}
                    </select>
                    {task.status !== "dismissed" && task.status !== "done" ? (
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => setStore(updateCaptureTaskStatus(task.id, "dismissed"))}
                      >
                        Dismiss
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
