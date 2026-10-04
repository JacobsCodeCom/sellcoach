import type { Metadata } from "next";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { MIRA_PRODUCTION_ORIGIN } from "@/lib/site";

export const metadata: Metadata = {
  title: "Chrome extension · Mira",
  description: "Install the Mira Chrome extension to learn and record Work Maps.",
};

export default function ExtensionInstallPage() {
  const storeUrl = process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL?.trim();

  return (
    <main>
      <AppNav />
      <article className="shell legal-page">
        <p className="section-kicker">Chrome extension</p>
        <h1>Get Mira for Chrome</h1>
        <p className="section-lead">
          Mira runs as a Chrome side panel next to your work. Use Learn for guided coaching, or
          Record to capture how experts do the job (active tab + microphone) into a Work Map.
        </p>

        {storeUrl ? (
          <p>
            <a className="btn btn-primary" href={storeUrl} target="_blank" rel="noreferrer">
              Install from the Chrome Web Store
            </a>
          </p>
        ) : (
          <div className="legal-callout">
            <p>
              <strong>Chrome Web Store listing is being prepared.</strong> Until it is public, your
              admin can share an unpacked build or a private/unlisted store link. Production Mira
              lives at{" "}
              <a href={MIRA_PRODUCTION_ORIGIN}>{MIRA_PRODUCTION_ORIGIN}</a>.
            </p>
          </div>
        )}

        <section>
          <h2>What the extension can access</h2>
          <ul>
            <li>Side panel UI for Mira Learn and Record</li>
            <li>Microphone, only after you allow it once</li>
            <li>Screenshots of the visible tab, only while you are recording</li>
            <li>A short coaching highlight on the active tab during Learn</li>
          </ul>
          <p>
            Full details are in the <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </section>

        <section>
          <h2>After install</h2>
          <ol>
            <li>Pin Mira and open the side panel.</li>
            <li>Sign in with the email from your company invite.</li>
            <li>Use Learn, or Start a recording when you are ready to capture a Work Map.</li>
          </ol>
        </section>

        <p className="legal-back">
          <Link href="/">← Back to Mira</Link>
        </p>
      </article>
    </main>
  );
}
