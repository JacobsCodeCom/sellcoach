"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { ExampleVideos } from "@/components/landing/ExampleVideos";
import { HeroStage } from "@/components/landing/HeroStage";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { IntegrationsShowcase } from "@/components/landing/IntegrationsShowcase";
import { homePathForSession } from "@/lib/repo";
import { useSession } from "@/lib/store";

export default function LandingPage() {
  const router = useRouter();
  const { ready, user, company, membership } = useSession();

  useEffect(() => {
    if (!ready || !user) return;
    router.replace(homePathForSession({ user, company, membership }));
  }, [ready, user, company, membership, router]);

  if (!ready) return null;
  if (user) return <p className="shell muted">Redirecting…</p>;

  return (
    <main className="landing">
      <AppNav />

      <section className="hero-band">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <div className="hero-brand-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="hero-brand-mark"
                src="/brand/mira-mark.svg"
                alt=""
                width={56}
                height={56}
                aria-hidden
              />
              <h1 className="hero-brand">Mira</h1>
            </div>
            <p className="hero-line">Your team learns from its best people.</p>
            <p className="hero-support">
              Record how experts do the work, find the fastest method for each task, and coach
              everyone in the same role on the job, from new hires to mid-level people learning from
              seniors.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" href="/signup">
                Get started
              </Link>
              <a className="btn-text" href="#how">
                See how it works
              </a>
            </div>
            <p className="hero-trust">
              Capture → compare methods → match by role & level → live hints
            </p>
          </div>
          <div className="hero-visual">
            <HeroStage />
          </div>
        </div>
      </section>

      <section className="shell section" id="how">
        <p className="section-kicker">How it works</p>
        <h2>From the best method to everyone.</h2>
        <p className="section-lead">One loop, running quietly inside Mira.</p>
        <HowItWorks />
      </section>

      <section className="section examples-band" id="examples">
        <div className="shell">
          <p className="section-kicker">Inside Mira</p>
          <h2>Everyone learns from the best way the work gets done</h2>
          <p className="section-lead">
            Mira records how people actually work, compares different methods for the same task,
            and matches the best one to whoever needs it, whether that&apos;s a new hire, a junior, or
            a mid-level person learning from a senior.
          </p>
          <ExampleVideos />
        </div>
      </section>

      <section className="shell section" id="integrations">
        <p className="section-kicker">Integrations</p>
        <h2>Start from the systems you already use.</h2>
        <p className="section-lead">
          Pull people and process knowledge into Mira so experts get capture tasks instead of a blank
          setup.
        </p>
        <IntegrationsShowcase />
      </section>

      <section className="shell section cta-band">
        <h2>Start with your experts.</h2>
        <p className="section-lead">
          Create an account, invite the people who know the work, and turn capture into guided
          onboarding.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary btn-lg" href="/signup">
            Get started
          </Link>
          <a className="btn-text" href="#examples">
            See the examples
          </a>
        </div>
      </section>

      <footer className="shell landing-foot">
        <span className="landing-foot-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mira-mark.svg" alt="" width={18} height={18} aria-hidden />
          <strong>Mira</strong>
        </span>
        <span className="landing-foot-links">
          <Link href="/extension">Chrome extension</Link>
          <Link href="/privacy">Privacy</Link>
        </span>
      </footer>
    </main>
  );
}
