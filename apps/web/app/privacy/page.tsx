import type { Metadata } from "next";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { MIRA_PRODUCTION_ORIGIN } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy · Mira",
  description: "How Mira collects, uses, and shares data for the web app and Chrome extension.",
};

export default function PrivacyPage() {
  return (
    <main>
      <AppNav />
      <article className="shell legal-page">
        <p className="section-kicker">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: 4 October 2026</p>
        <p className="section-lead">
          This policy covers the Mira website and the Mira Chrome extension (together, “Mira”). Mira
          helps teams learn from how experts do real work.
        </p>

        <section>
          <h2>Who we are</h2>
          <p>
            Mira is operated at{" "}
            <a href={MIRA_PRODUCTION_ORIGIN}>{MIRA_PRODUCTION_ORIGIN}</a>. For privacy questions,
            contact your company Mira admin, or use the support email listed on the Mira Chrome Web
            Store listing once published.
          </p>
        </section>

        <section>
          <h2>What Mira is for</h2>
          <p>
            Mira provides guided learning (“Learn”) and Work Map recording (“Record”) for people
            invited into a company workspace. The Chrome extension is a side panel that opens Mira
            beside the browser and, when you choose to record, captures the active tab and
            microphone so your company can turn expert work into lessons.
          </p>
        </section>

        <section>
          <h2>Data we collect</h2>
          <ul>
            <li>
              <strong>Account data</strong> — name, email, and authentication details you provide when
              you sign up or accept an invite.
            </li>
            <li>
              <strong>Company membership</strong> — which company, role, and invite you belong to
              (membership is by invite, not email domain).
            </li>
            <li>
              <strong>Work Map recordings</strong> — when you start a recording in the extension:
              screenshots of the visible browser tab, the tab’s URL, microphone audio processed for
              speech-to-text, and transcripts or notes you add in debrief/publish.
            </li>
            <li>
              <strong>Learning activity</strong> — progress on lessons/roadmaps and coaching
              interactions inside Mira.
            </li>
            <li>
              <strong>Technical data</strong> — basic logs needed to run the service (for example
              request times and error diagnostics). We do not use the extension to browse your
              history in the background.
            </li>
          </ul>
        </section>

        <section>
          <h2>Chrome extension permissions</h2>
          <p>
            The Mira extension requests access only to support Learn and Record. It can open a side
            panel, store a small amount of local setup state (such as whether microphone permission
            was completed), read the active tab URL while capturing, take screenshots of the visible
            tab during an explicit recording session, and briefly inject a coaching highlight on the
            active tab during Learn. Capture runs only after you press Start; it is not continuous
            surveillance.
          </p>
        </section>

        <section>
          <h2>How we use data</h2>
          <ul>
            <li>Provide your company workspace, invites, Learn, and Record features.</li>
            <li>Generate Work Maps, lessons, and on-the-job coaching for your team.</li>
            <li>
              Process recordings with infrastructure and AI providers that power transcription and
              debrief (currently including services such as speech/LLM APIs configured for the Mira
              deployment). Providers process data to deliver the feature; they are not given rights
              to sell your content.
            </li>
            <li>Maintain security, prevent abuse, and improve reliability.</li>
          </ul>
        </section>

        <section>
          <h2>How we share data</h2>
          <ul>
            <li>
              <strong>Your company</strong> — captures, lessons, and membership data are visible to
              people in that Mira company according to product roles (for example admins and
              teammates in the same workspace).
            </li>
            <li>
              <strong>Service providers</strong> — hosting (for example Vercel), AI/transcription
              vendors, and similar processors that help run Mira under contractual restrictions.
            </li>
            <li>
              <strong>Legal</strong> — if required by law or to protect users from serious harm.
            </li>
          </ul>
          <p>We do not sell personal information or recording content.</p>
        </section>

        <section>
          <h2>Retention</h2>
          <p>
            Account and workspace data are kept while your company uses Mira. Recordings and derived
            Work Maps remain until an authorized admin removes them or the workspace is deleted.
            Local extension storage (mic setup flags) stays on your device until you clear site/extension
            data or uninstall.
          </p>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            Data in transit uses HTTPS. API keys and model credentials stay on Mira servers — they are
            never shipped inside the Chrome extension package. You should still avoid recording
            unrelated sensitive pages when capturing Work Maps.
          </p>
        </section>

        <section>
          <h2>Your choices</h2>
          <ul>
            <li>You control when recording starts and stops.</li>
            <li>You can revoke microphone access in Chrome site/extension settings.</li>
            <li>
              You can ask your company admin to remove membership or content, or contact us at the
              email above for account deletion requests.
            </li>
            <li>Uninstalling the extension stops further capture from that browser.</li>
          </ul>
        </section>

        <section>
          <h2>Children</h2>
          <p>Mira is for workplace use and is not directed at children under 16.</p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            We may update this policy as the product changes. The “Last updated” date at the top will
            change when we do. Continued use of Mira after an update means you accept the revised
            policy.
          </p>
        </section>

        <p className="legal-back">
          <Link href="/">← Back to Mira</Link>
          {" · "}
          <Link href="/extension">Chrome extension</Link>
        </p>
      </article>
    </main>
  );
}
