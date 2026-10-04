"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { NotionIntegrationsPanel } from "@/components/NotionIntegrationsPanel";
import { OnboardingChat } from "@/components/OnboardingChat";
import { ensureCompanyForNotionImport, isOnboardingComplete } from "@/lib/repo";
import { useSession, useStore } from "@/lib/store";

type Path = "choose" | "notion" | "mira";

export default function OnboardingPage() {
  const router = useRouter();
  const { setStore } = useStore();
  const { ready, user, company, store } = useSession();
  const [path, setPath] = useState<Path>("choose");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/signup");
    else if (company && isOnboardingComplete(company)) router.replace("/admin");
  }, [ready, user, company, router]);

  if (!ready || !user || (company && isOnboardingComplete(company))) {
    return (
      <main>
        <AppNav />
        <section className="shell">
          <p className="muted">Loading…</p>
        </section>
      </main>
    );
  }

  function startNotion() {
    setError(null);
    try {
      const next = ensureCompanyForNotionImport({
        name: company?.name || `${user!.name.split(/\s+/)[0]}'s company`,
        summary: company?.summary || "Imported from Notion",
      });
      setStore(next);
      setPath("notion");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Notion setup");
    }
  }

  const activeCompany = company || store.companies.find((c) => c.id === store.activeCompanyId) || null;

  return (
    <main>
      <AppNav />
      <section className="shell levelup-shell">
        {path === "choose" ? (
          <div className="panel stack" style={{ maxWidth: "40rem" }}>
            <p className="tag">Company setup</p>
            <h1>Bring your company in</h1>
            <p className="muted">
              Connect Notion to import people and what they&apos;ve worked on. You map roles; experts get
              capture tasks instead of a blank setup guide.
            </p>
            {error ? <p className="error">{error}</p> : null}
            <div className="admin-drawer-actions">
              <button className="btn btn-primary" type="button" onClick={startNotion}>
                Connect Notion
              </button>
              <button className="btn" type="button" onClick={() => setPath("mira")}>
                Set up with Mira instead
              </button>
            </div>
          </div>
        ) : null}

        {path === "notion" ? (
          activeCompany ? (
            <div className="stack" style={{ gap: "1rem" }}>
              <div>
                <button className="btn-text" type="button" onClick={() => setPath("choose")}>
                  ← Back
                </button>
                <h1 style={{ marginTop: "0.5rem" }}>Import from Notion</h1>
                <p className="muted">
                  Sync, map each person, then confirm import. You&apos;ll land on Team — experts will see
                  tasks in Workspace.
                </p>
              </div>
              <NotionIntegrationsPanel
                store={store}
                companyId={activeCompany.id}
                setStore={setStore}
                onImported={() => router.replace("/admin")}
              />
            </div>
          ) : (
            <p className="muted">Preparing company…</p>
          )
        ) : null}

        {path === "mira" ? (
          <div className="stack" style={{ gap: "0.75rem" }}>
            <button className="btn-text" type="button" onClick={() => setPath("choose")}>
              ← Back
            </button>
            <OnboardingChat title="Set up Mira" />
          </div>
        ) : null}
      </section>
    </main>
  );
}
