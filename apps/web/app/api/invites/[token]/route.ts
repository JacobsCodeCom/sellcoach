import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

/** Public invite lookup by capability token (no auth). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const db = getAdminDb();
    const inviteSnap = await db.collection("invites").doc(token).get();
    if (!inviteSnap.exists) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    const invite = inviteSnap.data() as Record<string, unknown>;
    if (invite.revokedAt) {
      return NextResponse.json({ error: "Invite revoked" }, { status: 410 });
    }

    let company: Record<string, unknown> | null = null;
    const companyId = String(invite.companyId || "");
    if (companyId) {
      const companySnap = await db.collection("companies").doc(companyId).get();
      if (companySnap.exists) {
        const raw = companySnap.data() as Record<string, unknown>;
        company = {
          id: raw.id,
          name: raw.name,
          summary: raw.summary,
          createdAt: raw.createdAt,
          ownerUserId: raw.ownerUserId,
          onboardingComplete: raw.onboardingComplete,
        };
      } else if (invite.companyName) {
        company = {
          id: companyId,
          name: invite.companyName,
          createdAt: invite.createdAt,
          ownerUserId: "",
        };
      }
    }

    return NextResponse.json({ invite, company });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
