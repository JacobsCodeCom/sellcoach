"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

function NotionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4.2 3.5c.3-.3.8-.5 1.4-.5h12.1c.9 0 1.6.3 2 1l.9 1.4c.2.3.3.6.3 1v12.2c0 .7-.3 1.3-.8 1.6l-1.6 1c-.3.2-.7.3-1.1.3H5.6c-.9 0-1.6-.4-1.9-1.1L2.5 17c-.2-.4-.3-.8-.3-1.2V5.1c0-.6.2-1.1.5-1.4l1.5-.2Zm1.6 1.7-.8.1v10.9l1.1 2h10.7l1.1-.7V6.6l-.7-1.1H7.1l-1.3-.3Zm2.4 2.2h1.5l4.8 7.5V7.4h1.6v9.4h-1.5l-4.8-7.5v7.5H8.2V7.4Z"
      />
    </svg>
  );
}

function SlackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.5 14.3a1.7 1.7 0 1 1-1.7-1.7h1.7v1.7Zm.4 0a1.7 1.7 0 1 1 3.4 0v4.3a1.7 1.7 0 1 1-3.4 0v-4.3Zm1.7-6.4a1.7 1.7 0 1 1 1.7-1.7v1.7h-1.7Zm0 .4a1.7 1.7 0 1 1 0 3.4H6.3a1.7 1.7 0 1 1 0-3.4h4.3Zm6.4 1.7a1.7 1.7 0 1 1 1.7 1.7h-1.7V9.8Zm-.4 0a1.7 1.7 0 1 1-3.4 0V5.5a1.7 1.7 0 1 1 3.4 0v4.3Zm-1.7 6.4a1.7 1.7 0 1 1-1.7 1.7v-1.7h1.7Zm0-.4a1.7 1.7 0 1 1 0-3.4h4.3a1.7 1.7 0 1 1 0 3.4h-4.3Z"
      />
    </svg>
  );
}

function HubSpotIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.6 8.1V6.2a2.1 2.1 0 0 0 1.2-1.9 2.1 2.1 0 1 0-4.2 0c0 .8.4 1.5 1.1 1.8v2a5.8 5.8 0 0 0-2.8 1.2l-7-5.4a1.9 1.9 0 1 0-.9 1.2l6.7 5.2a5.8 5.8 0 1 0 5.9-2.2Zm-5.8 8.3a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Z"
      />
    </svg>
  );
}

function SalesforceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.2 7.2c.7-1.2 2-1.9 3.4-1.9 1.5 0 2.8.8 3.5 2.1.7-.4 1.5-.6 2.3-.6 2.3 0 4.1 1.9 4.1 4.2s-1.8 4.2-4.1 4.2c-.3 0-.6 0-.9-.1-.6 1.5-2.1 2.5-3.8 2.5-1 0-1.9-.3-2.6-.9-.7 1.2-2 2-3.5 2-2.3 0-4.1-1.9-4.1-4.2 0-.4.1-.9.2-1.3C3.6 12.5 2.5 11 2.5 9.2c0-2.3 1.8-4.1 4.1-4.1 1.3 0 2.5.6 3.2 1.6.1 0 .3-.1.4-.1.5-.6 1.2-1.1 2-.1.2 0 .3.1.5.2-.1.2-.3.3-.5.5Z"
      />
    </svg>
  );
}

function ConfluenceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.2 17.8c-.3.6 0 1.3.7 1.5l3.1 1.1c.6.2 1.3-.1 1.5-.7l4.3-11.4c.1-.3 0-.6-.2-.8L9.4 4.6c-.4-.4-1.1-.3-1.4.2L3.2 17.8Zm17.6-11.6c.3-.6 0-1.3-.7-1.5l-3.1-1.1c-.6-.2-1.3.1-1.5.7l-4.3 11.4c-.1.3 0 .6.2.8l3.2 2.9c.4.4 1.1.3 1.4-.2l5-12.9Z"
      />
    </svg>
  );
}

function GoogleWorkspaceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 4.5h6.2v6.2H4V4.5Zm9.8 0H20v6.2h-6.2V4.5ZM4 13.3h6.2V19.5H4v-6.2Zm9.8 0H20v6.2h-6.2v-6.2Z" />
    </svg>
  );
}

function LinearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.5 14.2A8.5 8.5 0 0 0 14.2 3.5L3.5 14.2Zm1.9 3.4 10.2-10.2a8.5 8.5 0 0 1-10.2 10.2Zm2.8 2.3a8.5 8.5 0 0 0 10.7-10.7L8.2 19.9Z"
      />
    </svg>
  );
}

function JiraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.1 2 5.4 8.7a4.4 4.4 0 0 0 0 6.2l2.1 2.1 2.4-2.4-.9-.9a1.8 1.8 0 0 1 0-2.5L12.1 8l3.1 3.1a1.8 1.8 0 0 1 0 2.5l-.9.9 2.4 2.4 2.1-2.1a4.4 4.4 0 0 0 0-6.2L12.1 2Zm0 8.6-2.4 2.4.9.9c.7.7 1.8.7 2.5 0l.9-.9-1.9-2.4Z"
      />
    </svg>
  );
}

const AVAILABLE = {
  id: "notion",
  name: "Notion",
  line: "Import people and company knowledge from your workspace so experts get capture tasks instead of a blank setup.",
  icon: <NotionIcon />,
} as const;

const UPCOMING: { id: string; name: string; icon: ReactNode }[] = [
  { id: "slack", name: "Slack", icon: <SlackIcon /> },
  { id: "hubspot", name: "HubSpot", icon: <HubSpotIcon /> },
  { id: "salesforce", name: "Salesforce", icon: <SalesforceIcon /> },
  { id: "confluence", name: "Confluence", icon: <ConfluenceIcon /> },
  { id: "google-workspace", name: "Google Workspace", icon: <GoogleWorkspaceIcon /> },
  { id: "linear", name: "Linear", icon: <LinearIcon /> },
  { id: "jira", name: "Jira", icon: <JiraIcon /> },
];

export function IntegrationsShowcase() {
  const [revealed, setRevealed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setRevealed(true);
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`integrations${revealed ? " is-revealed" : ""}`}>
      <article className="integrations-featured" style={{ ["--stagger" as string]: "0ms" }}>
        <div className="integrations-icon" data-brand={AVAILABLE.id}>
          {AVAILABLE.icon}
        </div>
        <div className="integrations-featured-copy">
          <div className="integrations-meta">
            <strong>{AVAILABLE.name}</strong>
            <span className="integrations-badge is-available">Available</span>
          </div>
          <p>{AVAILABLE.line}</p>
        </div>
      </article>

      <div className="integrations-upcoming">
        <p className="integrations-upcoming-label">Coming soon</p>
        <ul className="integrations-grid">
          {UPCOMING.map((item, index) => (
            <li key={item.id} style={{ ["--stagger" as string]: `${120 + index * 70}ms` }}>
              <div className="integrations-tile">
                <div className="integrations-icon" data-brand={item.id}>
                  {item.icon}
                </div>
                <div className="integrations-tile-copy">
                  <strong>{item.name}</strong>
                  <span>Coming soon</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
