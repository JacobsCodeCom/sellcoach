"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isOnboardingComplete } from "@/lib/repo";
import { useSession } from "@/lib/store";

/** Compatibility redirect — there is no /dashboard route in the product. */
export default function DashboardRedirect() {
  const router = useRouter();
  const { ready, user, company, membership } = useSession();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!company || !isOnboardingComplete(company)) {
      router.replace("/onboarding");
      return;
    }
    router.replace(membership?.platformRole === "owner" ? "/admin" : "/app");
  }, [ready, user, company, membership, router]);

  return <p className="shell muted">Redirecting…</p>;
}
