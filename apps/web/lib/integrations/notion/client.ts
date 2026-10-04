const NOTION_VERSION = "2022-06-28";

export function getNotionToken(override?: string): string | null {
  const token = override?.trim() || process.env.NOTION_API_KEY?.trim() || process.env.NOTION_TOKEN?.trim();
  return token || null;
}

export async function notionFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Notion API ${res.status}: ${body.slice(0, 240) || res.statusText}`);
  }
  return (await res.json()) as T;
}

export type NotionUser = {
  id: string;
  name?: string | null;
  person?: { email?: string };
  type?: string;
};

export type NotionRichText = { plain_text?: string };

export type NotionProperty = {
  type: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  select?: { name: string } | null;
  multi_select?: { name: string }[];
  people?: NotionUser[];
  email?: string | null;
  phone_number?: string | null;
  relation?: { id: string }[];
  files?: unknown[];
  checkbox?: boolean;
  date?: unknown;
  rollup?: unknown;
};

export type NotionPage = {
  id: string;
  url?: string;
  properties: Record<string, NotionProperty>;
};

type NotionSearchResponse = {
  results: Array<{
    id: string;
    object: string;
    title?: NotionRichText[];
    url?: string;
  }>;
  has_more: boolean;
  next_cursor: string | null;
};

type NotionQueryResponse = {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
};

export async function notionSearchDatabases(token: string): Promise<
  Array<{ id: string; title: string; url?: string }>
> {
  const out: Array<{ id: string; title: string; url?: string }> = [];
  let cursor: string | null = null;
  do {
    const response: NotionSearchResponse = await notionFetch<NotionSearchResponse>("/search", token, {
      method: "POST",
      body: JSON.stringify({
        filter: { value: "database", property: "object" },
        page_size: 50,
        start_cursor: cursor || undefined,
      }),
    });
    for (const item of response.results) {
      const title = (item.title || []).map((t) => t.plain_text || "").join("") || "Untitled database";
      out.push({ id: item.id, title, url: item.url });
    }
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return out;
}

export async function notionQueryDatabase(token: string, databaseId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;
  do {
    const body: Record<string, unknown> = { page_size: 50 };
    if (cursor) body.start_cursor = cursor;
    const response: NotionQueryResponse = await notionFetch<NotionQueryResponse>(
      `/databases/${databaseId}/query`,
      token,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return pages;
}

export async function notionGetPage(token: string, pageId: string): Promise<NotionPage> {
  return notionFetch<NotionPage>(`/pages/${pageId}`, token);
}

export async function notionGetBlockChildren(
  token: string,
  blockId: string,
  limit = 20,
): Promise<string[]> {
  const data = await notionFetch<{
    results: Array<{ type: string; [key: string]: unknown }>;
  }>(`/blocks/${blockId}/children?page_size=${limit}`, token);
  const lines: string[] = [];
  for (const block of data.results) {
    const type = block.type;
    const payload = block[type] as { rich_text?: NotionRichText[] } | undefined;
    const text = payload?.rich_text?.map((t) => t.plain_text || "").join("").trim();
    if (text) lines.push(text);
  }
  return lines;
}

export async function notionBotWorkspace(token: string): Promise<string> {
  const me = await notionFetch<{ name?: string; bot?: { workspace_name?: string } }>("/users/me", token);
  return me.bot?.workspace_name || me.name || "Notion workspace";
}

export function extractPlain(prop: NotionProperty | undefined): string {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return (prop.title || []).map((t) => t.plain_text || "").join("").trim();
    case "rich_text":
      return (prop.rich_text || []).map((t) => t.plain_text || "").join("").trim();
    case "select":
      return prop.select?.name?.trim() || "";
    case "multi_select":
      return (prop.multi_select || []).map((o) => o.name).join(", ");
    case "email":
      return prop.email?.trim() || "";
    case "people": {
      const people = prop.people || [];
      const emails = people.map((p) => p.person?.email).filter(Boolean) as string[];
      if (emails.length) return emails[0];
      return people.map((p) => p.name).filter(Boolean).join(", ");
    }
    default:
      return "";
  }
}

export function extractMulti(prop: NotionProperty | undefined): string[] {
  if (!prop) return [];
  if (prop.type === "multi_select") return (prop.multi_select || []).map((o) => o.name);
  if (prop.type === "relation") return (prop.relation || []).map((r) => r.id);
  const plain = extractPlain(prop);
  return plain ? [plain] : [];
}

export function findProperty(
  properties: Record<string, NotionProperty>,
  names: string[],
): NotionProperty | undefined {
  const entries = Object.entries(properties);
  for (const name of names) {
    const hit = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (hit) return hit[1];
  }
  if (names.some((n) => /name|namn/i.test(n))) {
    return entries.find(([, v]) => v.type === "title")?.[1];
  }
  return undefined;
}
