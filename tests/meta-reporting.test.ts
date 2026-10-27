import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { META_BINDINGS, metaConnectInput, publicMetaState, verifyMetaReporting, type MetaStored } from "../src/lib/meta-reporting";

const now = new Date("2026-10-27T12:00:00Z"), binding = META_BINDINGS.abstract;
const input = { entityId: "abstract" as const, accessToken: "test-only-token-".repeat(4), appSecret: "a".repeat(32), adAccountId: binding.adAccountId };
function fixture(options: { appId?: string; pageId?: string; returnedAdAccountId?: string; expiry?: number; scopes?: string[]; instagramId?: string; emptyReport?: boolean } = {}) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url)); calls.push({ url: u, init: init! });
    const proof = createHmac("sha256", input.appSecret).update(input.accessToken).digest("hex");
    assert.equal(u.origin, "https://graph.facebook.com"); assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error");
    assert.equal(u.searchParams.has("access_token"), false);
    if (u.pathname.endsWith("/debug_token")) {
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${binding.appId}|${input.appSecret}`);
      return Response.json({ data: { is_valid: true, app_id: options.appId ?? binding.appId, expires_at: options.expiry ?? now.getTime() / 1000 + 60 * 86400, scopes: options.scopes ?? ["pages_read_engagement", "pages_show_list", "ads_read"] } });
    }
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${input.accessToken}`);
    assert.equal(u.searchParams.get("appsecret_proof"), proof);
    if (u.pathname.endsWith(`/act_${input.adAccountId}/insights`)) return Response.json({ data: options.emptyReport ? [] : [{ date_start: "2026-09-27", date_stop: "2026-10-26", impressions: "1250", clicks: "25", reach: "1100", spend: "12.34" }] });
    if (u.pathname.endsWith(`/act_${input.adAccountId}`)) {
      assert.equal(u.searchParams.get("fields"), "id,name,currency,account_status");
      return Response.json({ id: options.returnedAdAccountId ?? `act_${input.adAccountId}`, name: "Abstract test account", currency: "USD", account_status: 1 });
    }
    if (u.searchParams.get("fields")?.includes("instagram_business_account")) return Response.json({ instagram_business_account: { id: options.instagramId ?? binding.instagramId, username: "abstractcapitalgroup" } });
    assert.equal(u.pathname, `/v26.0/${binding.pageId}`);
    return Response.json({ id: options.pageId ?? binding.pageId, name: "Abstract Capital Group" });
  }) as typeof fetch;
  return { calls, fetcher };
}

test("Meta reporting confirms exact company bindings and reads metrics with ads_read only", async () => {
  const { calls, fetcher } = fixture(); const snapshot = await verifyMetaReporting(input, fetcher, now);
  assert.equal(snapshot.page.id, binding.pageId); assert.equal(snapshot.adAccount?.id, input.adAccountId);
  assert.equal(snapshot.report?.spend, 12.34); assert.equal(snapshot.report?.clicks, 25);
  assert.equal(snapshot.instagram, null); assert.equal(calls.length, 4);
  assert.deepEqual(calls.map(c => c.url.pathname), ["/v26.0/debug_token", `/v26.0/${binding.pageId}`, `/v26.0/act_${input.adAccountId}`, `/v26.0/act_${input.adAccountId}/insights`]);
});
test("wrong issuing app or company Page fails before reading ad data", async () => {
  for (const options of [{ appId: "999999999999" }, { pageId: "999999999999" }]) {
    const f = fixture(options); await assert.rejects(verifyMetaReporting(input, f.fetcher, now));
    assert.equal(f.calls.some(c => c.url.pathname.includes("act_")), false);
  }
});
test("another business's ad account cannot be stored or have its report fetched", async () => {
  const f = fixture();
  await assert.rejects(verifyMetaReporting({ ...input, adAccountId: "999999999999" }, f.fetcher, now), /does not match Abstract/);
  assert.equal(f.calls.length, 0);
});

test("a mismatched ad-account response is rejected before reading its report", async () => {
  const f = fixture({ returnedAdAccountId: "act_999999999999" });
  await assert.rejects(verifyMetaReporting(input, f.fetcher, now), /expected business ad account/);
  assert.equal(f.calls.some(c => c.url.pathname.endsWith("/insights")), false);
});
test("expired, indefinite and unexpectedly long-lived tokens fail closed", async () => {
  for (const expiry of [0, now.getTime() / 1000 - 1, now.getTime() / 1000 + 90 * 86400]) {
    const f = fixture({ expiry }); await assert.rejects(verifyMetaReporting(input, f.fetcher, now)); assert.equal(f.calls.length, 1);
  }
});
test("required Page and advertising permissions are checked before asset reads", async () => {
  for (const scopes of [["ads_read"], ["pages_read_engagement"]]) {
    const f = fixture({ scopes }); await assert.rejects(verifyMetaReporting(input, f.fetcher, now)); assert.equal(f.calls.length, 1);
  }
});
test("Instagram is fetched only with its permission and must match the verified account", async () => {
  const scopes = ["pages_read_engagement", "ads_read", "instagram_basic"];
  const ok = fixture({ scopes }); assert.equal((await verifyMetaReporting(input, ok.fetcher, now)).instagram?.id, binding.instagramId);
  const wrong = fixture({ scopes, instagramId: "999999999999" });
  await assert.rejects(verifyMetaReporting(input, wrong.fetcher, now), /does not match Abstract/);
});
test("Page-only verification does not claim an ad account or invent an empty report", async () => {
  const f = fixture({ scopes: ["pages_read_engagement"] });
  const snapshot = await verifyMetaReporting({ ...input, adAccountId: undefined }, f.fetcher, now);
  assert.equal(f.calls.length, 2); assert.equal(snapshot.adAccount, null); assert.equal(snapshot.report, null);
  const empty = fixture({ emptyReport: true });
  const noDelivery = await verifyMetaReporting(input, empty.fetcher, now);
  assert.equal(noDelivery.adAccount?.id, input.adAccountId); assert.equal(noDelivery.report, null);
});
test("provider errors never return raw token, app secret or provider error contents", async () => {
  for (const fetcher of [
    (async () => new Response(JSON.stringify({ error: { message: input.accessToken + input.appSecret } }), { status: 400 })) as typeof fetch,
    (async () => { throw Error(input.accessToken + input.appSecret); }) as typeof fetch,
    (async () => new Response("not-json")) as typeof fetch,
  ]) {
    await assert.rejects(verifyMetaReporting(input, fetcher, now), e => {
      assert.ok(e instanceof Error); assert.equal(e.message.includes(input.accessToken), false); assert.equal(e.message.includes(input.appSecret), false); return true;
    });
  }
});
test("public connection state excludes secrets and distinguishes expiry, failed refresh, stale and revoked records", async () => {
  const f = fixture(), snapshot = await verifyMetaReporting(input, f.fetcher, now);
  const stored: MetaStored = { ...input, snapshot, revoked: false };
  const safe = publicMetaState(stored, 3, now);
  assert.equal(safe.state, "verified"); assert.equal(safe.publishingEnabled, false); assert.equal(safe.inboxSyncEnabled, false);
  assert.equal(JSON.stringify(safe).includes(input.accessToken), false); assert.equal(JSON.stringify(safe).includes(input.appSecret), false);
  assert.equal(publicMetaState({ ...stored, lastFailureAt: now.toISOString() }, 3, now).state, "needs_attention");
  assert.equal(publicMetaState(stored, 3, new Date(now.getTime() + 10 * 86400_000)).state, "stale");
  assert.equal(publicMetaState(stored, 3, new Date(snapshot.expiresAt)).state, "expired");
  const revoked = publicMetaState({ ...stored, revoked: true, accessToken: "", appSecret: "" }, 4, now);
  assert.equal(revoked.state, "disconnected"); assert.equal(revoked.snapshot, null);
});
test("connection inputs reject another entity, injected asset paths and unrecognized commands", () => {
  const request = { ...input, revision: 0 };
  assert.equal(metaConnectInput.safeParse(request).success, true);
  assert.equal(metaConnectInput.safeParse({ ...request, entityId: "venture" }).success, false);
  assert.equal(metaConnectInput.safeParse({ ...request, adAccountId: "12345678/../../me" }).success, false);
  assert.equal(metaConnectInput.safeParse({ ...request, publish: true }).success, false);
});
