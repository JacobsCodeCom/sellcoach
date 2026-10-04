"use client";

import { ExtShell } from "@/components/ext/ExtShell";

export default function ExtLayout({ children }: { children: React.ReactNode }) {
  return <ExtShell>{children}</ExtShell>;
}
