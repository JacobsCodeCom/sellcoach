import { NextResponse } from "next/server";
import { getNotionToken, notionSearchDatabases } from "@/lib/integrations/notion/client";
import { DEMO_NOTION_SYNC } from "@/lib/integrations/notion/normalize";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      demo?: boolean;
    };

    if (body.demo || body.token === "demo") {
      return NextResponse.json({
        ok: true,
        databases: [
          {
            id: DEMO_NOTION_SYNC.peopleDatabaseId,
            title: "Employees (demo)",
          },
        ],
      });
    }

    const token = getNotionToken(body.token);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Notion token required" }, { status: 400 });
    }

    const databases = await notionSearchDatabases(token);
    return NextResponse.json({ ok: true, databases });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Could not list databases" },
      { status: 500 },
    );
  }
}
