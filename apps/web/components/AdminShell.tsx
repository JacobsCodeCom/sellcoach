"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";

const TABS = [
  { href: "/admin", label: "Overview", match: "exact" as const },
  { href: "/admin/people", label: "People", match: "prefix" as const },
  { href: "/admin/lessons", label: "Lessons", match: "prefix" as const },
  { href: "/admin/agents", label: "Agents", match: "prefix" as const },
  { href: "/admin/company", label: "Company", match: "prefix" as const },
];

function tabActive(pathname: string, href: string, match: "exact" | "prefix") {
  if (match === "exact") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main>
      <AppNav />
      <section className="shell admin-page">
        <div className="admin-shell-head">
          <h1>Admin</h1>
          <nav className="admin-tabs" aria-label="Admin sections">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={tabActive(pathname, tab.href, tab.match) ? "is-active" : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
        {children}
      </section>
    </main>
  );
}
