import type { SocialPlatform } from "@/lib/types";

export const marketingPlatformLabels: Record<SocialPlatform, string> = {
  meta: "Meta", tiktok: "TikTok", google_ads: "Google Ads", seo: "SEO",
};
export function isMarketingPlatform(value: unknown): value is SocialPlatform {
  return typeof value === "string" && Object.hasOwn(marketingPlatformLabels, value);
}
export function isSearchPlatform(value: unknown): value is "seo" | "google_ads" {
  return value === "seo" || value === "google_ads";
}

/** Validate saved search plans; these records never create provider campaigns. */
export function validateSearchPlan(body: Record<string, unknown>): string | null {
  for (const key of ["impressions", "clicks", "leads", "spendCents", "budgetCents", "dailyBudgetCents"]) {
    const value = body[key];
    if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) return `${key} must be a non-negative integer`;
  }
  for (const key of ["budgetDollars", "dailyBudgetDollars", "spendDollars"]) {
    const value = body[key];
    if (value !== undefined && value !== null && value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0)) return `${key} must be a non-negative amount`;
  }
  for (const key of ["scheduleStart", "scheduleEnd"]) {
    const value = body[key];
    if (value !== undefined && value !== null && value !== "") {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Choose valid calendar dates";
      const date = new Date(value + "T12:00:00Z");
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Choose valid calendar dates";
    }
  }
  if (typeof body.scheduleStart === "string" && body.scheduleStart && typeof body.scheduleEnd === "string" && body.scheduleEnd && body.scheduleEnd < body.scheduleStart) return "End date must follow the start date";
  if (body.landingUrl) {
    try { const url = new URL(String(body.landingUrl)); if (!["https:", "http:"].includes(url.protocol)) return "Website must use http or https"; }
    catch { return "Enter a valid website URL"; }
  }
  if (body.status !== undefined && !["draft", "paused", "archived"].includes(String(body.status))) return "Search plans stay draft or paused until live provider integration is configured";
  return null;
}

export type SearchSetup = { website: string; competitors: string; keywords: string; locations: string; analyticsId: string; researchTool: string; notes: string };
export const emptySearchSetup: SearchSetup = { website: "", competitors: "", keywords: "", locations: "", analyticsId: "", researchTool: "Semrush", notes: "" };
export function readSearchSetup(notes?: string): SearchSetup {
  if (!notes) return { ...emptySearchSetup };
  try {
    const parsed = JSON.parse(notes);
    if (parsed.version !== "search-setup-v1") return { ...emptySearchSetup, notes };
    return Object.fromEntries(Object.entries(emptySearchSetup).map(([key, fallback]) => [key, typeof parsed[key] === "string" ? parsed[key] : fallback])) as SearchSetup;
  } catch { return { ...emptySearchSetup, notes }; }
}
export function writeSearchSetup(setup: SearchSetup): string { return JSON.stringify({ ...setup, version: "search-setup-v1" }); }
