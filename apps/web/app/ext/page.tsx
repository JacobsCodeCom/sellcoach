"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CaptureFlow } from "@/components/capture/CaptureFlow";
import { canCaptureAs } from "@/lib/repo";
import { useSession } from "@/lib/store";

/** Record home for capturers; learners are sent to /ext/learn. */
export default function ExtHomePage() {
  const router = useRouter();
  const { ready, membership, store } = useSession();
  const workRole = useMemo(
    () => store.workRoles.find((r) => r.id === membership?.workRoleId) ?? null,
    [store.workRoles, membership?.workRoleId],
  );
  const canRecord = canCaptureAs(membership, workRole);

  useEffect(() => {
    if (!ready || !membership) return;
    if (!canRecord) router.replace("/ext/learn");
  }, [ready, membership, canRecord, router]);

  if (!ready || !membership || !canRecord) {
    return (
      <div className="ext-start">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <CaptureFlow basePath="/ext" embedded homeHref="/ext" />
    </Suspense>
  );
}
