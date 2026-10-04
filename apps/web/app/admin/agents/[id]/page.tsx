"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { AbilityTrigger, ActionIntent, AgentAbility } from "@mira/core";
import { AgentRunPlayer } from "@/components/AgentRunPlayer";
import { PixelAgent } from "@/components/OnboardingChat";
import {
  createAbility,
  isOnboardingComplete,
  publishedWorkMapCaptures,
  saveAbilityRun,
  updateAbility,
  updateAgent,
} from "@/lib/repo";
import { useSession, useStore } from "@/lib/store";

type DryRunState = {
  abilityId: string;
  runKey: string;
  summary: string;
  intents: ActionIntent[];
  source: string;
};

export default function AgentDetailPage() {
  const params = useParams();
  const agentId = String(params?.id || "");
  const router = useRouter();
  const { setStore } = useStore();
  const { ready, user, company, membership, store } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dryContexts, setDryContexts] = useState<Record<string, string>>({});
  const [dryBusyId, setDryBusyId] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<DryRunState | null>(null);
  const [addAdvanced, setAddAdvanced] = useState(false);
  const [addTrigger, setAddTrigger] = useState<AbilityTrigger>("manual");
  const [editAdvanced, setEditAdvanced] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/");
    else if (!company) router.replace("/onboarding");
    else if (!isOnboardingComplete(company)) router.replace("/onboarding");
    else if (membership?.platformRole !== "owner") {
      router.replace(membership?.newHire ? "/learn" : "/app");
    }
  }, [ready, user, company, membership, router]);

  const agent = useMemo(
    () => store.agents.find((a) => a.id === agentId && a.companyId === company?.id) ?? null,
    [store.agents, agentId, company?.id],
  );
  const roles = useMemo(
    () => store.workRoles.filter((r) => r.companyId === company?.id),
    [store.workRoles, company?.id],
  );
  const abilities = useMemo(
    () =>
      store.abilities
        .filter((a) => a.agentId === agentId)
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt),
    [store.abilities, agentId],
  );
  const sources = useMemo(
    () => (company ? publishedWorkMapCaptures(store, company.id) : []),
    [store, company],
  );
  const recentRuns = useMemo(
    () =>
      store.abilityRuns
        .filter((r) => r.agentId === agentId)
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5),
    [store.abilityRuns, agentId],
  );

  function onUpdateAgent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!agent) return;
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
      setStore(
        updateAgent(agent.id, {
          name: String(data.get("name") || ""),
          brief: String(data.get("brief") || ""),
          workRoleId: String(data.get("workRoleId") || "") || null,
          status: data.get("status") === "active" ? "active" : "draft",
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update agent");
    }
  }

  function onAddAbility(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!agent) return;
    setError(null);
    const data = new FormData(e.currentTarget);
    const trigger = String(data.get("trigger") || "manual") as AbilityTrigger;
    const extraRaw = String(data.get("extraGuardrails") || "");
    try {
      setStore(
        createAbility({
          agentId: agent.id,
          name: String(data.get("name") || ""),
          sourceCaptureId: String(data.get("sourceCaptureId") || ""),
          trigger,
          triggerDescription: String(data.get("triggerDescription") || ""),
          notes: String(data.get("notes") || ""),
          extraGuardrails: extraRaw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          enabled: true,
        }),
      );
      e.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add ability");
    }
  }

  function onSaveAbility(e: FormEvent<HTMLFormElement>, ability: AgentAbility) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const trigger = String(data.get("trigger") || "manual") as AbilityTrigger;
    const extraRaw = String(data.get("extraGuardrails") || "");
    try {
      setStore(
        updateAbility(ability.id, {
          name: String(data.get("name") || ""),
          trigger,
          triggerDescription: String(data.get("triggerDescription") || ""),
          notes: String(data.get("notes") || ""),
          extraGuardrails: extraRaw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          enabled: data.get("enabled") === "on",
        }),
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update ability");
    }
  }

  async function runDryRun(ability: AgentAbility) {
    if (!company) return;
    const context = dryContexts[ability.id] || "";
    setError(null);
    setDryBusyId(ability.id);
    setDryRun(null);
    try {
      const capture = store.captures.find((c) => c.id === ability.sourceCaptureId);
      const workMap = capture?.workMap;
      if (!workMap?.steps.length) throw new Error("Work Map missing for this ability");

      const res = await fetch("/api/agent/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workMap,
          abilityName: ability.name,
          notes: ability.notes,
          extraGuardrails: ability.extraGuardrails,
          trigger: ability.trigger,
          triggerDescription: ability.triggerDescription,
          context,
        }),
      });
      const payload = (await res.json()) as {
        error?: string;
        summary?: string;
        intents?: ActionIntent[];
        source?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Dry-run failed");
      const intents = payload.intents || [];
      const summary = payload.summary || "";
      setStore(
        saveAbilityRun({
          abilityId: ability.id,
          agentId: ability.agentId,
          context,
          plan: intents,
          summary,
          status: "complete",
        }),
      );
      setDryRun({
        abilityId: ability.id,
        runKey: `${ability.id}-${Date.now()}`,
        summary,
        intents,
        source: payload.source || "model",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dry-run failed");
    } finally {
      setDryBusyId(null);
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

  if (!agent) {
    return (
      <>
        <p className="error">Agent not found.</p>
        <Link href="/admin/agents">Back to Agents</Link>
      </>
    );
  }

  return (
    <div className="admin-agent-detail">
      <div className="admin-section-head">
        <div>
          <p className="tag">
            <Link href="/admin/agents" style={{ color: "inherit" }}>
              Agents
            </Link>
          </p>
          <h2 style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <PixelAgent state="waiting" />
            {agent.name}
          </h2>
        </div>
      </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="grid-2">
          <form className="panel stack" onSubmit={onUpdateAgent}>
            <h3>Agent</h3>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" required defaultValue={agent.name} key={agent.name} />
            </div>
            <div className="field">
              <label htmlFor="brief">Brief</label>
              <input id="brief" name="brief" defaultValue={agent.brief} key={`brief-${agent.brief}`} />
            </div>
            <div className="field">
              <label htmlFor="workRoleId">Work role</label>
              <select id="workRoleId" name="workRoleId" defaultValue={agent.workRoleId ?? ""}>
                <option value="">None</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.title} · {role.competence}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={agent.status}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit">
              Save agent
            </button>
          </form>

          <form
            className="panel stack"
            onSubmit={(e) => {
              onAddAbility(e);
              setAddAdvanced(false);
              setAddTrigger("manual");
            }}
          >
            <h3>Add ability</h3>
            <div className="field">
              <label htmlFor="abilityName">Name</label>
              <input id="abilityName" name="name" placeholder="Handle invoice exceptions" />
            </div>
            <div className="field">
              <label htmlFor="sourceCaptureId">Work Map source</label>
              <select id="sourceCaptureId" name="sourceCaptureId" required defaultValue="">
                <option value="" disabled>
                  Select published capture…
                </option>
                {sources.map((cap) => (
                  <option key={cap.id} value={cap.id}>
                    {cap.workMap?.title || "Untitled"} · {new Date(cap.publishedAt!).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>
            {!sources.length ? (
              <p className="muted">No published Work Maps yet — capture and publish one first.</p>
            ) : null}
            {!addAdvanced ? (
              <>
                <input type="hidden" name="trigger" value="manual" />
                <input type="hidden" name="triggerDescription" value="" />
                <input type="hidden" name="notes" value="" />
                <input type="hidden" name="extraGuardrails" value="" />
                <button className="btn-text" type="button" onClick={() => setAddAdvanced(true)}>
                  Advanced
                </button>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="trigger">Trigger</label>
                  <select
                    id="trigger"
                    name="trigger"
                    value={addTrigger}
                    onChange={(e) => setAddTrigger(e.target.value as AbilityTrigger)}
                  >
                    <option value="manual">Manual</option>
                    <option value="described">Described (when…)</option>
                  </select>
                </div>
                {addTrigger === "described" ? (
                  <div className="field">
                    <label htmlFor="triggerDescription">When it should fire</label>
                    <input
                      id="triggerDescription"
                      name="triggerDescription"
                      placeholder="When a new invoice exception ticket arrives"
                    />
                  </div>
                ) : (
                  <input type="hidden" name="triggerDescription" value="" />
                )}
                <div className="field">
                  <label htmlFor="notes">Notes</label>
                  <textarea id="notes" name="notes" rows={2} placeholder="Extra instructions" />
                </div>
                <div className="field">
                  <label htmlFor="extraGuardrails">Extra stop rules (one per line)</label>
                  <textarea
                    id="extraGuardrails"
                    name="extraGuardrails"
                    rows={2}
                    placeholder="Never approve over $5k without a human"
                  />
                </div>
              </>
            )}
            <button className="btn btn-primary" type="submit" disabled={!sources.length}>
              Add ability
            </button>
          </form>
        </div>

        <div className="panel stack" style={{ marginTop: "1.25rem" }}>
          <h3>Abilities</h3>
          {!abilities.length ? <p className="muted">No abilities yet.</p> : null}
          <ul className="list">
            {abilities.map((ability) => {
              const capture = store.captures.find((c) => c.id === ability.sourceCaptureId);
              const editing = editingId === ability.id;
              return (
                <li
                  key={ability.id}
                  style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                    <div>
                      <strong>{ability.name}</strong>
                      {!ability.enabled ? (
                        <span className="tag" style={{ marginLeft: "0.5rem" }}>
                          disabled
                        </span>
                      ) : null}
                      <div className="muted">
                        From {capture?.workMap?.title || "Work Map"} · trigger: {ability.trigger}
                        {ability.trigger === "described" && ability.triggerDescription
                          ? ` — ${ability.triggerDescription}`
                          : ""}
                      </div>
                    </div>
                    <div className="member-actions">
                      <button
                        className="btn-text"
                        type="button"
                        onClick={() =>
                          setStore(updateAbility(ability.id, { enabled: !ability.enabled }))
                        }
                      >
                        {ability.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        className="btn-text"
                        type="button"
                        onClick={() => {
                          setEditingId(editing ? null : ability.id);
                          setEditAdvanced(false);
                        }}
                      >
                        {editing ? "Close" : "Edit"}
                      </button>
                    </div>
                  </div>

                  {editing ? (
                    <form
                      className="stack"
                      onSubmit={(e) => {
                        onSaveAbility(e, ability);
                        setEditAdvanced(false);
                      }}
                    >
                      <div className="field">
                        <label htmlFor={`name-${ability.id}`}>Name</label>
                        <input
                          id={`name-${ability.id}`}
                          name="name"
                          required
                          defaultValue={ability.name}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`trigger-${ability.id}`}>Trigger</label>
                        <select
                          id={`trigger-${ability.id}`}
                          name="trigger"
                          defaultValue={ability.trigger}
                        >
                          <option value="manual">Manual</option>
                          <option value="described">Described</option>
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={`td-${ability.id}`}>When it should fire</label>
                        <input
                          id={`td-${ability.id}`}
                          name="triggerDescription"
                          defaultValue={ability.triggerDescription}
                        />
                      </div>
                      {!editAdvanced ? (
                        <>
                          <input type="hidden" name="notes" value={ability.notes} />
                          <input
                            type="hidden"
                            name="extraGuardrails"
                            value={ability.extraGuardrails.join("\n")}
                          />
                          <button
                            className="btn-text"
                            type="button"
                            onClick={() => setEditAdvanced(true)}
                          >
                            Advanced
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="field">
                            <label htmlFor={`notes-${ability.id}`}>Notes</label>
                            <textarea
                              id={`notes-${ability.id}`}
                              name="notes"
                              rows={2}
                              defaultValue={ability.notes}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`extra-${ability.id}`}>Extra stop rules</label>
                            <textarea
                              id={`extra-${ability.id}`}
                              name="extraGuardrails"
                              rows={2}
                              defaultValue={ability.extraGuardrails.join("\n")}
                            />
                          </div>
                        </>
                      )}
                      <label className="check-field">
                        <input name="enabled" type="checkbox" defaultChecked={ability.enabled} />
                        <span>Enabled</span>
                      </label>
                      <button className="btn btn-primary" type="submit">
                        Save ability
                      </button>
                    </form>
                  ) : null}

                  <div className="stack">
                    <div className="field">
                      <label htmlFor={`ctx-${ability.id}`}>Dry-run context (optional)</label>
                      <textarea
                        id={`ctx-${ability.id}`}
                        rows={2}
                        value={dryContexts[ability.id] || ""}
                        onChange={(e) =>
                          setDryContexts((prev) => ({ ...prev, [ability.id]: e.target.value }))
                        }
                        placeholder="e.g. Invoice #4821 is $6,200 and flagged as duplicate"
                      />
                    </div>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={Boolean(dryBusyId) || !ability.enabled}
                      onClick={() => runDryRun(ability)}
                    >
                      {dryBusyId === ability.id ? "Planning…" : "Run (simulate)"}
                    </button>
                  </div>

                  {dryRun?.abilityId === ability.id && capture?.workMap ? (
                    <div className="agent-plan">
                      <AgentRunPlayer
                        runKey={dryRun.runKey}
                        summary={dryRun.summary}
                        intents={dryRun.intents}
                        source={dryRun.source}
                        workMap={capture.workMap}
                        moments={capture.moments ?? []}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        {recentRuns.length ? (
          <div className="panel stack" style={{ marginTop: "1.25rem" }}>
            <h3>Recent dry runs</h3>
            <ul className="list">
              {recentRuns.map((run) => {
                const ability = abilities.find((a) => a.id === run.abilityId);
                return (
                  <li key={run.id}>
                    <div>
                      <strong>{ability?.name || "Ability"}</strong>
                      <div className="muted">
                        {new Date(run.createdAt).toLocaleString()} · {run.plan.length} steps
                      </div>
                      <div className="muted">{run.summary}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
    </div>
  );
}
