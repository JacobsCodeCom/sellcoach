import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Server ack — connection state lives in the client store for v1. */
export async function POST() {
  return NextResponse.json({ ok: true });
}
