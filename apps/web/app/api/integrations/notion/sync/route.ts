import { NextResponse } from "next/server";
import {
  getNotionToken,
  notionGetBlockChildren,
  notionGetPage,
  notionQueryDatabase,
} from "@/lib/integrations/notion/client";
import {
  DEMO_NOTION_SYNC,
  normalizeKnowledgePage,
  normalizeNotionPerson,
  topicsFromPerson,
  type NormalizedNotionTopic,
} from "@/lib/integrations/notion/normalize";

export const runtime = "nodejs";

function parseNotionId(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/([a-f0-9]{32})/i)?.[1];
  if (fromUrl) return fromUrl;
  return trimmed.replace(/-/g, "");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      demo?: boolean;
      peopleDatabaseId?: string;
      knowledgeSourceIds?: string[];
      workspaceName?: string;
    };

    if (body.demo || body.token === "demo" || body.peopleDatabaseId === "demo-employees") {
      return NextResponse.json({
        ok: true,
        mode: "demo",
        workspaceName: body.workspaceName || DEMO_NOTION_SYNC.workspaceName,
        peopleDatabaseId: DEMO_NOTION_SYNC.peopleDatabaseId,
        knowledgeSourceIds: DEMO_NOTION_SYNC.knowledgeSourceIds,
        people: DEMO_NOTION_SYNC.people,
        topics: [
          ...DEMO_NOTION_SYNC.topics,
          ...DEMO_NOTION_SYNC.people.flatMap((p) =>
            topicsFromPerson({
              ...p,
              jobRoles: p.jobRoles,
              workSummaries: p.workSummaries,
            }),
          ),
        ],
      });
    }

    const token = getNotionToken(body.token);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Notion token required" }, { status: 400 });
    }
    if (!body.peopleDatabaseId) {
      return NextResponse.json({ ok: false, error: "peopleDatabaseId required" }, { status: 400 });
    }

    const databaseId = parseNotionId(body.peopleDatabaseId);
    const pages = await notionQueryDatabase(token, databaseId);
    const people = pages
      .map((page) => normalizeNotionPerson(page))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));

    const topics: NormalizedNotionTopic[] = people.flatMap((p) => topicsFromPerson(p));
    const knowledgeIds = (body.knowledgeSourceIds || []).map(parseNotionId).filter(Boolean);

    for (const id of knowledgeIds) {
      try {
        const page = await notionGetPage(token, id);
        const lines = await notionGetBlockChildren(token, id, 24);
        const topic = normalizeKnowledgePage(page, lines);
        if (topic) topics.push(topic);
      } catch {
        // Skip inaccessible knowledge pages rather than failing the whole sync.
      }
    }

    // Dedupe topics by externalId
    const byId = new Map(topics.map((t) => [t.externalId, t]));

    return NextResponse.json({
      ok: true,
      mode: "live",
      workspaceName: body.workspaceName || "Notion",
      peopleDatabaseId: databaseId,
      knowledgeSourceIds: knowledgeIds,
      people,
      topics: [...byId.values()],
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
