"use client";

import { getClientAuth } from "@/lib/firebase/client";
import { firebaseReady } from "@/lib/firebase/client";

export async function sendInviteEmail(token: string): Promise<void> {
  if (!firebaseReady()) {
    throw new Error("Firebase is not configured");
  }
  const user = getClientAuth().currentUser;
  if (!user) throw new Error("Sign in required");
  const idToken = await user.getIdToken();
  const res = await fetch("/api/invites/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ token }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not send invite email");
  }
}
