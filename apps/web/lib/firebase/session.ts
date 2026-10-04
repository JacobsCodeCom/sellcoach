"use client";

import type { User as FirebaseUser } from "firebase/auth";
import { hydrateSharedFromCloud } from "@/lib/firebase/sync";
import { bindAuthUser, persistStore, type Store } from "@/lib/repo";

export async function completeAuthSession(fbUser: FirebaseUser): Promise<Store> {
  const email = (fbUser.email || "").trim().toLowerCase();
  if (!email) throw new Error("Your account needs an email address");
  const name = (fbUser.displayName || email.split("@")[0] || "User").trim();
  let store = bindAuthUser({ uid: fbUser.uid, email, name });
  store = await hydrateSharedFromCloud(store, fbUser.uid, { email, name });
  return persistStore(store);
}
