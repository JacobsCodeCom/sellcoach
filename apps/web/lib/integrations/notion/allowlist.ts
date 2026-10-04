/** Work-relevant Notion property names we sync. Everything else is ignored. */
export const NOTION_PEOPLE_ALLOWLIST = [
  "Namn",
  "Name",
  "Användare",
  "Person",
  "Email",
  "E-post",
  "Roll",
  "Role",
  "Job roles",
  "Job role",
  "Area",
  "Profile Eng",
  "Profile Swe",
  "Sample pitch (Eng)",
  "Sample pitch (Swe)",
  "Assignment",
  "Active consultant?",
] as const;

export const NOTION_PEOPLE_BLOCKLIST = [
  "Personnummer",
  "Allergies/preferences",
  "Nära anhörig",
  "Sjukvårdsförsäkring",
  "Sjukvårdsförsäkring medförsäkrad",
  "T-shirt storlek",
  "Phone",
  "Faktureringskommentarer",
  "Fakturering klar (CFO)",
] as const;

export function isBlockedProperty(name: string): boolean {
  const n = name.trim().toLowerCase();
  return NOTION_PEOPLE_BLOCKLIST.some((b) => b.toLowerCase() === n);
}
