import { z } from "zod";

export const TIKTOK_REPORT_KEY = "internal_tiktok_reporting_v1";
export const TIKTOK_ACCOUNT = "_000DSE3qW7xZI4cUR3vNRauV3xnUCE13Bhk";
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const tiktokSnapshotSchema = z.object({
  checkedAt: z.iso.datetime(), fetchedAt: z.iso.datetime(),
  username: z.literal("abstractcapitalgroup"), accountId: z.literal(TIKTOK_ACCOUNT),
  businessAccount: z.boolean(), followers: count, following: count, likes: count, videos: count,
}).strict();
export const tiktokStoredSchema = z.object({
  entityId: z.literal("abstract"), apiKey: z.string().max(512), revoked: z.boolean(),
  snapshot: tiktokSnapshotSchema.nullable(), lastFailureAt: z.iso.datetime().optional(),
}).strict();
export type TiktokStored = z.infer<typeof tiktokStoredSchema>;
export type TiktokSnapshot = z.infer<typeof tiktokSnapshotSchema>;
export class TiktokReportError extends Error {
  constructor() { super("TikTok reporting could not verify Abstract's account and recent totals. Check Windsor access, plan limits and the selected account; a temporary provider delay is also possible."); }
}
export function publicTiktokState(stored: TiktokStored | null, revision: number, now = new Date()) {
  const state = !stored ? "not_connected" : stored.revoked ? "disconnected" : stored.lastFailureAt ? "needs_attention" : !stored.snapshot || now.getTime() - Date.parse(stored.snapshot.fetchedAt) > 48 * 3600000 ? "stale" : "verified";
  return { state, revision, snapshot: stored?.snapshot ?? null, automaticRefreshEnabled: !!stored && !stored.revoked, publishingEnabled: false, adsEnabled: false };
}

const providerCount = z.union([count, z.string().regex(/^\d+$/).transform(Number).pipe(count)]);
const rowSchema = z.object({
  account_id: z.literal(TIKTOK_ACCOUNT), username: z.literal("abstractcapitalgroup"),
  is_business_account: z.union([z.boolean(), z.enum(["True", "False", "true", "false"])]).transform(v => v === true || v === "True" || v === "true"),
  total_followers_count: providerCount, following_count: providerCount, total_likes: providerCount, videos_count: providerCount,
  data_fetched_at: z.string().max(40),
});
/** Fixed source/account only. Never expose the query URL: Windsor requires the secret in its query string. */
export async function fetchTiktokReport(apiKey: string, fetcher: typeof fetch = fetch, now = new Date()): Promise<TiktokSnapshot> {
  try {
    if (!apiKey.trim() || apiKey.length > 512) throw new TiktokReportError();
    const url = new URL("https://connectors.windsor.ai/tiktok_organic");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("select_accounts", TIKTOK_ACCOUNT);
    // Current-day profile rows may still be empty. Read one completed UTC day,
    // avoiding both partial rows and summing account totals across a date range.
    const reportDate = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    url.searchParams.set("date_from", reportDate);
    url.searchParams.set("date_to", reportDate);
    url.searchParams.set("fields", "account_id,username,is_business_account,total_followers_count,following_count,total_likes,videos_count,data_fetched_at");
    const response = await fetcher(url, { method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000), headers: { Accept: "application/json", "User-Agent": "Windsor/1.0" } });
    if (!response.ok || !response.body) throw new TiktokReportError();
    const reader = response.body.getReader();
    let bytes = 0; const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        bytes += value.length;
        if (bytes > 50000) { await reader.cancel(); throw new TiktokReportError(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const payload = z.object({ data: z.array(rowSchema).length(1) }).parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const row = payload.data[0];
    // Windsor returns UTC timestamps without an offset as well as ISO timestamps.
    const stamp = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(row.data_fetched_at) ? row.data_fetched_at.replace(" ", "T") + "Z" : row.data_fetched_at;
    const fetched = Date.parse(z.iso.datetime({ offset: true }).parse(stamp));
    if (fetched > now.getTime() + 300000 || now.getTime() - fetched > 48 * 3600000) throw new TiktokReportError();
    return tiktokSnapshotSchema.parse({ checkedAt: now.toISOString(), fetchedAt: new Date(fetched).toISOString(), accountId: row.account_id, username: row.username, businessAccount: row.is_business_account, followers: row.total_followers_count, following: row.following_count, likes: row.total_likes, videos: row.videos_count });
  } catch { throw new TiktokReportError(); }
}
