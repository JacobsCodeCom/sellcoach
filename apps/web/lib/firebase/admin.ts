import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function initAdmin(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")?.trim();

  if (clientEmail && privateKey && projectId) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId,
    });
  }

  // Local / GCP ADC fallback when service-account env vars are absent.
  return initializeApp({ projectId: projectId || undefined });
}

export function getAdminAuth() {
  return getAuth(initAdmin());
}

export function getAdminDb() {
  return getFirestore(initAdmin());
}

export async function verifyIdToken(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new Error("Missing bearer token");
  return getAdminAuth().verifyIdToken(token);
}
