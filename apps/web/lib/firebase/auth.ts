"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { firebaseReady, getClientAuth } from "@/lib/firebase/client";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/popup-blocked": "Allow popups for this site to continue with Google.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/account-exists-with-different-credential":
    "An account already exists with this email using a different sign-in method.",
};

function authErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const code = "code" in err ? err.code : null;
  return typeof code === "string" ? code : null;
}

/** Map Firebase Auth errors to short, user-facing copy. */
export function humanizeAuthError(err: unknown, fallback: string): string {
  const code = authErrorCode(err);
  if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code];
  if (err instanceof Error && err.message && !err.message.startsWith("Firebase:")) {
    return err.message;
  }
  return fallback;
}

export function watchAuth(callback: (user: FirebaseUser | null) => void): () => void {
  if (!firebaseReady()) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(getClientAuth(), callback);
}

export async function signInWithGoogle(): Promise<FirebaseUser> {
  const result = await signInWithPopup(getClientAuth(), googleProvider);
  return result.user;
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<FirebaseUser> {
  const cred = await createUserWithEmailAndPassword(
    getClientAuth(),
    email.trim().toLowerCase(),
    password,
  );
  const displayName = name.trim() || email.split("@")[0] || "User";
  await updateProfile(cred.user, { displayName });
  return cred.user;
}

export async function signInWithEmail(email: string, password: string): Promise<FirebaseUser> {
  const cred = await signInWithEmailAndPassword(
    getClientAuth(),
    email.trim().toLowerCase(),
    password,
  );
  return cred.user;
}

export async function signOutFirebase(): Promise<void> {
  if (!firebaseReady()) return;
  await firebaseSignOut(getClientAuth());
}

export function getFirebaseEmail(): string | null {
  if (!firebaseReady()) return null;
  return getClientAuth().currentUser?.email?.toLowerCase() ?? null;
}

export function requireFirebaseEmail(): string {
  const email = getFirebaseEmail();
  if (!email) throw new Error("Sign in required");
  return email;
}

export function getFirebaseUid(): string | null {
  if (!firebaseReady()) return null;
  return getClientAuth().currentUser?.uid ?? null;
}
