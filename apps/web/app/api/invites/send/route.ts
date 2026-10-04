import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getAdminDb, verifyIdToken } from "@/lib/firebase/admin";
import { chromeExtensionInstallUrl, miraPublicOrigin } from "@/lib/site";

export const runtime = "nodejs";

type Body = {
  inviteId?: string;
  token?: string;
};

export async function POST(request: Request) {
  try {
    const decoded = await verifyIdToken(request.headers.get("authorization"));
    const body = (await request.json()) as Body;
    const token = body.token?.trim();
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured" },
        { status: 503 },
      );
    }

    const db = getAdminDb();
    const inviteSnap = await db.collection("invites").doc(token).get();
    if (!inviteSnap.exists) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    const invite = inviteSnap.data() as {
      id: string;
      token: string;
      companyId: string;
      email: string;
      name: string;
      newHire?: boolean;
      revokedAt?: number;
      acceptedAt?: number;
    };
    if (invite.revokedAt) {
      return NextResponse.json({ error: "Invite was revoked" }, { status: 410 });
    }
    if (invite.acceptedAt) {
      return NextResponse.json({ error: "Invite already accepted" }, { status: 409 });
    }

    const companySnap = await db.collection("companies").doc(invite.companyId).get();
    if (!companySnap.exists) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    const company = companySnap.data() as { name: string; ownerUserId: string };
    if (company.ownerUserId !== decoded.uid) {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }

    const inviteUrl = `${miraPublicOrigin()}/invite/${invite.token}`;
    const extUrl = chromeExtensionInstallUrl();
    const from =
      process.env.RESEND_FROM_EMAIL?.trim() || "Mira <onboarding@resend.dev>";

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: invite.email,
      subject: `You're invited to ${company.name} on Mira`,
      text: [
        `Hi ${invite.name || "there"},`,
        "",
        `${company.name} invited you to Mira.`,
        "",
        `1. Open your invite and sign in with ${invite.email}:`,
        inviteUrl,
        "",
        invite.newHire
          ? "After you join, open Learn in Mira for your guided learning plan."
          : "After you join, open Workspace in Mira to record Work Maps and learn.",
        "",
        `(Optional) Chrome extension when available: ${extUrl}`,
        "",
        "— Mira",
      ].join("\n"),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    const status = message.includes("bearer") || message.includes("auth") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
