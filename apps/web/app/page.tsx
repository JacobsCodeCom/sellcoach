"use client";

import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { ExampleVideos } from "@/components/landing/ExampleVideos";
import { HeroStage } from "@/components/landing/HeroStage";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { useSession } from "@/lib/store";

export default function LandingPage() {
  const { user, membership } = useSession();
  const primaryHref = user
    ? membership?.platformRole === "owner"
      ? "/admin"
      : "/app"
    : "/signup";
  const primaryLabel = user ? "Open workspace" : "Get started";

  return (
    <main className="landing">
      <AppNav />

      <section className="hero-band">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <h1 className="hero-brand">Mira</h1>
            <p className="hero-line">Your team learns from its best people.</p>
            <p className="hero-support">
              Record how experts do the work, find the fastest method for each task, and coach
              everyone in the same role on the job, from new hires to mid-level people learning from
              seniors.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" href={primaryHref}>
                {primaryLabel}
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
            and matches the best one to whoever needs it, whether that's a new hire, a junior, or
            a mid-level person learning from a senior.
          </p>
          <ExampleVideos />
        </div>
      </section>

      <section className="shell section cta-band">
        <h2>Start with your experts.</h2>
        <p className="section-lead">
          Create an account, invite the people who know the work, and turn capture into guided
          onboarding.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary btn-lg" href={primaryHref}>
            {primaryLabel}
          </Link>
          <a className="btn-text" href="#examples">
            See the examples
          </a>
        </div>
      </section>

      <footer className="shell landing-foot">
        <strong>Mira</strong>
        <span>Voice in · sparse hints · stays out of the way</span>
      </footer>
    </main>
  );
}
