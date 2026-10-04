"use client";

import { useMemo } from "react";
import { LearnerHome } from "@/components/LearnerHome";
import { useSession } from "@/lib/store";

/** Learner roadmap inside the Chrome extension side panel. */
export default function ExtLearnPage() {
  const { ready, user, membership, store } = useSession();
  const workRole = useMemo(
    () => store.workRoles.find((r) => r.id === membership?.workRoleId) ?? null,
    [store.workRoles, membership?.workRoleId],
  );

  if (!ready || !user || !membership) {
    return (
      <div className="ext-start">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <LearnerHome
      store={store}
      user={user}
      membership={membership}
      workRole={workRole}
      embedded
    />
  );
}
