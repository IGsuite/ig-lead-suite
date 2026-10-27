import { createHmac } from "node:crypto";
import { z } from "zod";

// First-party pilot. Other companies need separately verified asset mappings.
export const META_BINDINGS = {
  abstract: {
    appId: "1644892387181144", businessId: "971365496886205",
    pageId: "102579522502024", instagramId: "17841451098883230",
  },
} as const;
export const META_CREDENTIAL_KEY = "internal_meta_reporting_v1";
const graphOrigin = "https://graph.facebook.com/v26.0/";
export const metaAssetId = z.string().regex(/^\d{8,32}$/);
export const metaConnectInput = z.object({
  entityId: z.literal("abstract"), revision: z.number().int().min(0),
  accessToken: z.string().trim().min(40).max(8000),
  appSecret: z.string().trim().regex(/^[a-fA-F0-9]{32}$/),
  adAccountId: metaAssetId.optional(),
}).strict();
const amount = z.union([z.string().regex(/^\d+(?:\.\d+)?$/), z.number().finite().nonnegative()]).transform(Number);
export const metaSnapshotSchema = z.object({
  checkedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  page: z.object({ id: metaAssetId, name: z.string().max(300) }),
  instagram: z.object({ id: metaAssetId, username: z.string().max(100) }).nullable(),
  adAccount: z.object({ id: metaAssetId, name: z.string().max(300), currency: z.string().regex(/^[A-Z]{3}$/), accountStatus: z.number().int() }).nullable(),
  report: z.object({ dateStart: z.string(), dateStop: z.string(), impressions: amount, clicks: amount, reach: amount, spend: amount }).nullable(),
  permissions: z.array(z.string().max(100)).max(100),
});
export type MetaSnapshot = z.infer<typeof metaSnapshotSchema>;
export const metaStoredSchema = z.object({
  entityId: z.literal("abstract"), accessToken: z.string(), appSecret: z.string(),
  adAccountId: metaAssetId.optional(), snapshot: metaSnapshotSchema,
  revoked: z.boolean().default(false), lastFailureAt: z.iso.datetime().optional(),
}).strict();
export type MetaStored = z.infer<typeof metaStoredSchema>;

export class MetaReportingError extends Error {}
function fail(message: string): never { throw new MetaReportingError(message); }

/** All provider calls are GETs to fixed Meta resources. Never return provider error text. */
async function graph(path: string, token: string, parameters: Record<string, string>, fetcher: typeof fetch) {
  const url = new URL(path, graphOrigin);
  if (url.origin !== "https://graph.facebook.com" || !url.pathname.startsWith("/v26.0/")) fail("Invalid Meta resource.");
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetcher(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  } catch { fail("Meta could not be reached. No connection changes were saved."); }
  if (!response.ok) fail("Meta denied this read request. Check the selected assets, permissions and token expiry.");
  const length = Number(response.headers.get("content-length"));
  if (length > 1_000_000) fail("Meta returned an unexpectedly large response.");
  // Fixed-field responses are small; do not expose raw JSON or provider errors.
  let raw: string; try { raw = await response.text(); } catch { fail("Meta returned an unreadable response."); }
  if (raw.length > 1_000_000) fail("Meta returned an unexpectedly large response.");
  try { const data = JSON.parse(raw); if (data.error) fail("Meta could not verify this connection."); return data; }
  catch (error) { if (error instanceof MetaReportingError) throw error; fail("Meta returned an unreadable response."); }
}

/** Verify the issuing app, expiry, exact company Page and ad-account ownership before storing anything. */
export async function verifyMetaReporting(
  input: Pick<z.infer<typeof metaConnectInput>, "entityId" | "accessToken" | "appSecret" | "adAccountId">,
  fetcher: typeof fetch = fetch, now = new Date(),
): Promise<MetaSnapshot> {
  const binding = META_BINDINGS[input.entityId];
  if (!binding) fail("This company has no verified Meta asset mapping yet.");
  if (input.adAccountId && !metaAssetId.safeParse(input.adAccountId).success) fail("Choose a valid business ad account ID.");
  // Meta documents input_token on debug_token. Never log the request URL or response.
  const debug = await graph("debug_token", `${binding.appId}|${input.appSecret}`, { input_token: input.accessToken }, fetcher);
  const parsed = z.object({ data: z.object({ is_valid: z.literal(true), app_id: z.string(), expires_at: z.number().int().positive(), data_access_expires_at: z.number().int().nonnegative().optional(), scopes: z.array(z.string()).max(100) }) }).safeParse(debug);
  if (!parsed.success) fail("Meta could not confirm a valid, expiring token. Use a token with a 60-day expiry.");
  const token = parsed.data.data;
  if (token.app_id !== binding.appId) fail("This token belongs to a different Meta app.");
  const expirySeconds = token.data_access_expires_at ? Math.min(token.expires_at, token.data_access_expires_at) : token.expires_at;
  const expiry = expirySeconds * 1000;
  if (expiry <= now.getTime() + 60_000 || expiry > now.getTime() + 61 * 86400_000) fail("Use a valid token expiring within 60 days.");
  if (!token.scopes.includes("pages_read_engagement")) fail("The token needs Page engagement read access.");
  if (input.adAccountId && !token.scopes.some(s => s === "ads_read" || s === "ads_management")) fail("The token needs ad reporting access for the selected account.");
  const proof = createHmac("sha256", input.appSecret).update(input.accessToken).digest("hex");
  const read = (path: string, fields: string) => graph(path, input.accessToken, { fields, appsecret_proof: proof }, fetcher);
  const pageResult = z.object({ id: z.string(), name: z.string().max(300) }).safeParse(await read(binding.pageId, "id,name"));
  if (!pageResult.success || pageResult.data.id !== binding.pageId) fail("Meta did not confirm Abstract's expected Facebook Page.");
  let instagram: MetaSnapshot["instagram"] = null;
  if (token.scopes.includes("instagram_basic")) {
    const linked = z.object({ instagram_business_account: z.object({ id: z.string(), username: z.string().max(100) }).nullable().optional() }).safeParse(await read(binding.pageId, "instagram_business_account{id,username}"));
    if (!linked.success || !linked.data.instagram_business_account || linked.data.instagram_business_account.id !== binding.instagramId) fail("The linked Instagram account does not match Abstract's verified account.");
    instagram = linked.data.instagram_business_account;
  }
  let adAccount: MetaSnapshot["adAccount"] = null, report: MetaSnapshot["report"] = null;
  if (input.adAccountId) {
    const account = z.object({ id: z.string(), name: z.string().max(300), business: z.object({ id: z.string() }), currency: z.string().regex(/^[A-Z]{3}$/), account_status: z.number().int() }).safeParse(await read(`act_${input.adAccountId}`, "id,name,business,currency,account_status"));
    if (!account.success || account.data.id !== `act_${input.adAccountId}` || account.data.business.id !== binding.businessId) fail("This ad account is not owned by Abstract's verified business portfolio.");
    adAccount = { id: input.adAccountId, name: account.data.name, currency: account.data.currency, accountStatus: account.data.account_status };
    const metrics = await graph(`act_${input.adAccountId}/insights`, input.accessToken, { fields: "date_start,date_stop,impressions,clicks,reach,spend", date_preset: "last_30d", level: "account", appsecret_proof: proof }, fetcher);
    const rows = z.object({ data: z.array(z.object({ date_start: z.string(), date_stop: z.string(), impressions: amount, clicks: amount, reach: amount, spend: amount })).max(1), paging: z.object({ next: z.string().optional() }).optional() }).safeParse(metrics);
    if (!rows.success || rows.data.paging?.next) fail("Meta returned an incomplete ad report.");
    const row = rows.data.data[0];
    // Empty data is a successful report with no delivery, not a failed connection.
    if (row) report = { dateStart: row.date_start, dateStop: row.date_stop, impressions: row.impressions, clicks: row.clicks, reach: row.reach, spend: row.spend };
  }
  return metaSnapshotSchema.parse({ checkedAt: now.toISOString(), expiresAt: new Date(expiry).toISOString(), page: pageResult.data, instagram, adAccount, report, permissions: token.scopes });
}

export function publicMetaState(stored: MetaStored | null, revision: number, now = new Date()) {
  return {
    state: !stored ? "not_connected" : stored.revoked ? "disconnected" : Date.parse(stored.snapshot.expiresAt) <= now.getTime() ? "expired" : stored.lastFailureAt ? "needs_attention" : now.getTime() - Date.parse(stored.snapshot.checkedAt) > 9 * 86400_000 ? "stale" : "verified",
    revision, snapshot: stored?.revoked ? null : stored?.snapshot ?? null,
    // The connector deliberately has no publication or message-sending action.
    publishingEnabled: false, inboxSyncEnabled: false,
  };
}
