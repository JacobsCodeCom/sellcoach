"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { homePathForSession } from "@/lib/repo";
import { useSession } from "@/lib/store";

export default function GettingStartedPage() {
  const router = useRouter();
  const { ready, user, company, membership } = useSession();

  useEffect(() => {
    if (!ready) return;
    router.replace(homePathForSession({ user, company, membership }));
  }, [ready, user, company, membership, router]);

  return (
    <main>
      <section className="shell">
        <p className="muted">Loading…</p>
      </section>
    </main>
  );
}
