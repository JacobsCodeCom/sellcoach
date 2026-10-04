"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import type {
  Company,
  Invite,
  Membership,
  User,
  WorkRole,
} from "@mira/core";
import { firebaseReady, getClientAuth, getClientDb } from "@/lib/firebase/client";
import type { Store } from "@/lib/repo";

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const next = { ...value };
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

async function upsert(db: Firestore, path: string, id: string, data: Record<string, unknown>) {
  await setDoc(doc(db, path, id), stripUndefined(data), { merge: true });
}

function currentUid(): string | null {
  if (!firebaseReady()) return null;
  return getClientAuth().currentUser?.uid ?? null;
}

/** Remove a shared collection doc so deletes survive the next hydrate. */
export async function deleteSharedDoc(path: "workRoles", id: string): Promise<void> {
  if (!firebaseReady()) return;
  const db = getClientDb();
  await deleteDoc(doc(db, path, id));
}

/** Push users/companies/memberships/invites/workRoles touched by this store snapshot. */
export async function syncSharedToCloud(store: Store): Promise<void> {
  if (!firebaseReady()) return;
  const db = getClientDb();
  const uid = currentUid();
  if (!uid) return;

  // Rules only allow writing your own users/{uid} doc. Invite stubs stay local
  // until the invitee signs in and claim/remap happens — never block company sync.
  const selfUsers = store.users.filter((u) => u.id === uid);
  await Promise.all(selfUsers.map((u) => upsert(db, "users", u.id, { ...u })));
  // Ordered so company owner docs exist before membership/invite owner checks.
  await Promise.all(
    store.companies
      .filter((c) => Boolean(c.ownerUserId))
      .map((c) => upsert(db, "companies", c.id, { ...c })),
  );
  await Promise.all([
    ...store.memberships.map((m) => upsert(db, "memberships", m.id, { ...m })),
    ...store.workRoles.map((r) => upsert(db, "workRoles", r.id, { ...r })),
  ]);
  await Promise.all(
    store.invites.map((inv) =>
      upsert(db, "invites", inv.token, {
        ...inv,
        email: inv.email.toLowerCase(),
      }),
    ),
  );
}

export async function syncInviteToCloud(invite: Invite): Promise<void> {
  if (!firebaseReady()) return;
  const db = getClientDb();
  await upsert(db, "invites", invite.token, {
    ...invite,
    email: invite.email.toLowerCase(),
  });
}

export async function fetchInviteByToken(token: string): Promise<{
  invite: Invite;
  company: Company | null;
} | null> {
  if (!firebaseReady() || !token) return null;
  const db = getClientDb();
  const snap = await getDoc(doc(db, "invites", token));
  if (!snap.exists()) return null;
  const invite = snap.data() as Invite;
  if (invite.revokedAt) return null;
  let company: Company | null = null;
  if (invite.companyId) {
    try {
      const companySnap = await getDoc(doc(db, "companies", invite.companyId));
      if (companySnap.exists()) company = companySnap.data() as Company;
    } catch {
      company = null;
    }
  }
  if (!company && invite.companyName) {
    company = {
      id: invite.companyId,
      name: invite.companyName,
      createdAt: invite.createdAt,
      ownerUserId: "",
    };
  }
  return { invite, company };
}

/** Load membership graph for a signed-in Firebase user into the local store shape. */
export async function hydrateSharedFromCloud(
  store: Store,
  uid: string,
  profile: { email: string; name: string },
): Promise<Store> {
  if (!firebaseReady()) return store;
  const db = getClientDb();
  const email = profile.email.toLowerCase();

  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  const user: User = userSnap.exists()
    ? (userSnap.data() as User)
    : {
        id: uid,
        email,
        name: profile.name,
        createdAt: Date.now(),
      };
  if (!userSnap.exists()) {
    await upsert(db, "users", uid, { ...user });
  }

  // Invites for this email (list rule: email match). Also used to claim stub memberships.
  const emailInvites = await getDocs(
    query(collection(db, "invites"), where("email", "==", email)),
  );
  const invites: Invite[] = emailInvites.docs.map((d) => d.data() as Invite);

  // Memberships may still point at a local stub userId until first accept/hydrate remap.
  const memSnap = await getDocs(query(collection(db, "memberships"), where("userId", "==", uid)));
  const memberships = memSnap.docs.map((d) => d.data() as Membership);
  const claimedIds = new Set(memberships.map((m) => m.id));

  for (const inv of invites) {
    if (!inv.membershipId || claimedIds.has(inv.membershipId)) continue;
    const memRef = doc(db, "memberships", inv.membershipId);
    const memDoc = await getDoc(memRef);
    if (!memDoc.exists()) continue;
    const membership = memDoc.data() as Membership;
    if (membership.companyId !== inv.companyId) continue;
    if (membership.userId !== uid && inv.acceptedAt) {
      // Recover after accept when cloud still has the invite stub userId.
      const claimed = { ...membership, userId: uid };
      await upsert(db, "memberships", claimed.id, { ...claimed });
      memberships.push(claimed);
    } else {
      // Pending invites: keep stub userId locally so acceptInvite can re-point.
      memberships.push(membership);
    }
    claimedIds.add(membership.id);
  }

  const companyIds = [
    ...new Set([
      ...memberships.map((m) => m.companyId),
      ...invites.map((i) => i.companyId).filter(Boolean),
    ]),
  ];

  const companies: Company[] = [];
  const workRoles: WorkRole[] = [];
  const relatedUserIds = new Set<string>([uid]);

  for (const companyId of companyIds) {
    const companySnap = await getDoc(doc(db, "companies", companyId));
    const company = companySnap.exists() ? (companySnap.data() as Company) : null;
    if (company) companies.push(company);

    const isOwner = company?.ownerUserId === uid;
    const [roleSnap, companyMemSnap, inviteSnap] = await Promise.all([
      getDocs(query(collection(db, "workRoles"), where("companyId", "==", companyId))),
      getDocs(query(collection(db, "memberships"), where("companyId", "==", companyId))),
      // Invites list-by-companyId is only allowed for company owners (rules OR + query).
      isOwner
        ? getDocs(query(collection(db, "invites"), where("companyId", "==", companyId)))
        : Promise.resolve(null),
    ]);

    workRoles.push(...roleSnap.docs.map((d) => d.data() as WorkRole));
    if (inviteSnap) {
      for (const inv of inviteSnap.docs.map((d) => d.data() as Invite)) {
        if (!invites.some((i) => i.id === inv.id)) invites.push(inv);
      }
    }
    for (const m of companyMemSnap.docs.map((d) => d.data() as Membership)) {
      relatedUserIds.add(m.userId);
      if (!memberships.some((x) => x.id === m.id)) memberships.push(m);
    }
  }

  const users: User[] = [user];
  await Promise.all(
    [...relatedUserIds].map(async (id) => {
      if (id === uid) return;
      const snap = await getDoc(doc(db, "users", id));
      if (snap.exists()) users.push(snap.data() as User);
    }),
  );

  const myMemberships = memberships.filter((m) => m.userId === uid);
  const activeCompanyId =
    store.activeCompanyId && companies.some((c) => c.id === store.activeCompanyId)
      ? store.activeCompanyId
      : (myMemberships[0]?.companyId ?? store.activeCompanyId);

  return {
    ...store,
    users: mergeById(store.users, users),
    companies: mergeById(store.companies, companies),
    memberships: mergeById(store.memberships, memberships),
    workRoles: mergeById(store.workRoles, workRoles),
    invites: mergeById(store.invites, invites),
    sessionUserId: uid,
    activeCompanyId,
  };
}

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of remote) map.set(item.id, item);
  return [...map.values()];
}

export function mergeInviteIntoStore(
  store: Store,
  invite: Invite,
  company: Company | null,
): Store {
  let next = {
    ...store,
    invites: store.invites.some((i) => i.id === invite.id)
      ? store.invites.map((i) => (i.id === invite.id ? invite : i))
      : [...store.invites, invite],
  };
  if (company && !next.companies.some((c) => c.id === company.id)) {
    next = { ...next, companies: [...next.companies, company] };
  } else if (company) {
    next = {
      ...next,
      companies: next.companies.map((c) => (c.id === company.id ? company : c)),
    };
  }
  return next;
}
