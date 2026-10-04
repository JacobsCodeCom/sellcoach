"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { LearnerHome } from "@/components/LearnerHome";
import { isOnboardingComplete } from "@/lib/repo";
import { useSession } from "@/lib/store";

export default function LearnPage() {
  const router = useRouter();
  const { ready, user, company, membership, store } = useSession();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/");
    else if (!company) router.replace("/onboarding");
    else if (!isOnboardingComplete(company) && membership?.platformRole === "owner") {
      router.replace("/onboarding");
    }
  }, [ready, user, company, membership, router]);

  const workRole = useMemo(
    () => store.workRoles.find((r) => r.id === membership?.workRoleId) ?? null,
    [store.workRoles, membership?.workRoleId],
  );

  if (!ready || !user || !company || !membership) {
    return (
      <main>
        <AppNav />
        <section className="shell">
          <p className="muted">Loading…</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <AppNav />
      <section className="shell">
        <LearnerHome store={store} user={user} membership={membership} workRole={workRole} />
      </section>
    </main>
  );
}
