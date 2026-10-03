"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { OnboardingChat } from "@/components/OnboardingChat";
import { isOnboardingComplete } from "@/lib/repo";
import { useSession } from "@/lib/store";

export default function OnboardingPage() {
  const router = useRouter();
  const { ready, user, company } = useSession();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/signup");
    else if (company && isOnboardingComplete(company)) router.replace("/admin");
  }, [ready, user, company, router]);

  if (!ready || !user || (company && isOnboardingComplete(company))) {
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
      <section className="shell levelup-shell">
        <OnboardingChat title="Set up Mira" />
      </section>
    </main>
  );
}
