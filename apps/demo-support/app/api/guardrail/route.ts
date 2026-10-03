import { checkGuardrail } from "@/lib/rules";
import type { Draft, Load, Truck } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    load?: Load;
    draft?: Draft;
    trucks?: Truck[];
    intent?: "select" | "assign" | "save";
  };
  if (!body.load || !body.draft || !Array.isArray(body.trucks)) {
    return NextResponse.json({ status: "allow" });
  }
  const result = checkGuardrail({
    load: body.load,
    draft: body.draft,
    trucks: body.trucks,
    intent: body.intent ?? "save",
  });
  return NextResponse.json(result);
}
