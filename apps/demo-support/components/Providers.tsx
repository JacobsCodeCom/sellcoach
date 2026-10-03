"use client";

import { ConversationProvider } from "@elevenlabs/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  if (!agentId) return children;
  return <ConversationProvider agentId={agentId}>{children}</ConversationProvider>;
}
