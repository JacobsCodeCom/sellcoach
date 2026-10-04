import { NextResponse } from "next/server";
import { getNotionToken, notionBotWorkspace } from "@/lib/integrations/notion/client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      demo?: boolean;
    };

    if (body.demo) {
      return NextResponse.json({
        ok: true,
        mode: "demo",
        workspaceName: "Demo workspace",
        tokenRef: "demo",
      });
    }

    const token = getNotionToken(body.token);
    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No Notion token. Set NOTION_API_KEY in the server env, pass a token, or use demo mode.",
        },
        { status: 400 },
      );
    }

    const workspaceName = await notionBotWorkspace(token);
    return NextResponse.json({
      ok: true,
      mode: "live",
      workspaceName,
      tokenRef: body.token ? "request" : "env",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Connect failed" },
      { status: 500 },
    );
  }
}
