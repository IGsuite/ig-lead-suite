import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseEmailReply, parseSmsReply } from "../src/lib/inbound-events";
import { resolveReplyBrand } from "../src/lib/reply-routing";
import { canAccessEntity } from "../src/lib/acl";
import { conversationKey } from "../src/lib/conversation-key";
import type { Brand } from "../src/lib/types";

const brands = [
  { id: "a", domain: "brand-a.example", sendingSubdomain: "mail.brand-a.example", phoneNumbers: ["+15165550101"] },
  { id: "b", domain: "brand-b.example", sendingSubdomain: "mail.brand-b.example", phoneNumbers: ["+15165550102"] },
] as Brand[];
const email = { event_type: "EMAIL_REPLY", to_email: "client@example.com", from_email: "info@brand-a.example",
  reply_body: "<p>Full reply</p><p>Second line</p>", preview_text: "Full…", campaign_id: 123, time_replied: "2026-10-20T01:00:00Z" };

test("routes the same contact by receiving brand and preserves full text", () => {
  const a = parseEmailReply(email, brands)!;
  const b = parseEmailReply({ ...email, from_email: "info@brand-b.example" }, brands)!;
  assert.equal(a.brandId, "a"); assert.equal(b.brandId, "b");
  assert.equal(a.body, "Full reply\nSecond line");
  assert.equal(a.providerContext?.mailbox, "info@brand-a.example");
  assert.notEqual(a.id, b.id);
  assert.equal(a.id, parseEmailReply(email, brands)!.id);
});
test("unknown, conflicting and shared identities do not fall into another portal", () => {
  assert.throws(() => parseEmailReply({ ...email, from_email: "info@unknown.example" }, brands));
  assert.throws(() => parseEmailReply({ ...email, brandId: "b" }, brands));
  assert.throws(() => resolveReplyBrand([...brands, { ...brands[0], id: "c" }], { channel: "email", mailbox: "info@brand-a.example" }));
  assert.throws(() => resolveReplyBrand(brands, { channel: "email", providerCampaignId: "123" }, { SMARTLEAD_CAMPAIGN_A: "123", SMARTLEAD_CAMPAIGN_B: "123" }));
  assert.equal(parseEmailReply({ event_type: "LEAD_CATEGORY_UPDATED" }, brands), null);
});
test("SMS routes by receiving number; delivery receipts never become replies", () => {
  const event = { data: { id: "evt-1", event_type: "message.received", payload: { id: "sms-1", direction: "inbound",
    from: { phone_number: "+15165550999" }, to: [{ phone_number: "+15165550102" }], text: "Hello" } } };
  assert.equal(parseSmsReply(event, brands)?.brandId, "b");
  assert.equal(parseSmsReply({ data: { ...event.data, event_type: "message.finalized" } }, brands), null);
  assert.equal(parseSmsReply({ data: { ...event.data, payload: { ...event.data.payload, direction: "outbound" } } }, brands), null);
});
test("members cannot read or send from another brand", () => {
  const session = { userId: "member", email: "member@example.com", role: "member" as const, allowedEntityIds: ["a"], exp: Date.now() + 10000 };
  assert.equal(canAccessEntity(session, "a"), true);
  assert.equal(canAccessEntity(session, "b"), false);
});

test("durable replies deduplicate and outbound sends never retry a provider submission", async () => {
  const previousCwd = process.cwd(), previousDb = process.env.DATABASE_URL, originalFetch = global.fetch;
  const dir = await fs.mkdtemp(path.join(previousCwd, "..", "ig-inbox-test-"));
  process.chdir(dir); process.env.DATABASE_URL = "";
  try {
    const { ensureStore, writeStore } = await import("../src/lib/json-store-io");
    const { saveInbound, listInboxSends } = await import("../src/lib/inbox-store");
    const { sendConversationReply, assertReplyAllowed } = await import("../src/lib/inbox-service");
    const data = await ensureStore();
    data.brands = brands; data.replies = []; data.leads = []; data.campaigns = []; data.optOuts = [];
    await writeStore(data);
    const incoming = parseEmailReply(email, brands)!;
    const first = await saveInbound(incoming);
    assert.notEqual(conversationKey(first), conversationKey({ ...first, brandId: "b" }));
    assert.notEqual(conversationKey(first), conversationKey({ ...first, providerContext: { ...first.providerContext, campaignId: "456" } }));
    assert.notEqual(conversationKey(first), conversationKey({ ...first, providerContext: { ...first.providerContext, mailbox: "sales@brand-a.example" } }));
    await Promise.all([saveInbound(incoming), saveInbound(incoming)]);
    const loaded = await ensureStore();
    assert.equal(loaded.replies.length, 1); assert.equal(loaded.leads.length, 1);
    loaded.leads[0].lastEntityId = "b"; await writeStore(loaded);
    await saveInbound(parseEmailReply({ ...email, from_email: "info@brand-b.example" }, brands)!);
    assert.deepEqual((await ensureStore()).replies.map((r) => r.brandId).sort(), ["a", "b"]);
    assert.equal((await ensureStore()).leads.length, 1);
    loaded.leads[0].optedOut = true;
    assert.throws(() => assertReplyAllowed(loaded, first), /opted out/);
    loaded.leads[0].optedOut = false;
    let submissions = 0;
    process.env.SMARTLEAD_API_KEY = "test-key";
    global.fetch = async (url, options) => {
      const target = String(url);
      if (options?.method === "POST") {
        submissions++;
        const payload = JSON.parse(String(options.body));
        assert.equal(payload.email_stats_id, "765");
        assert.equal(payload.to_email, "client@example.com");
        assert.equal(payload.email_body, "Thanks &lt;client&gt;");
        return Response.json({ ok: true, id: "job-1" });
      }
      if (target.includes("/leads/?")) return Response.json({ id: 9, email: first.from, lead_campaign_data: [{ campaign_id: 123 }] });
      if (target.includes("message-history")) return Response.json({ from: "info@brand-a.example", to: first.from, history: [{ stats_id: "765", type: "REPLY", time: "2026-10-20T01:00:00Z" }] });
      if (target.includes("email-accounts")) return Response.json([{ from_email: "info@brand-a.example" }]);
      throw new Error("Unexpected provider request");
    };
    const id = randomUUID();
    const accepted = await sendConversationReply(loaded, first, "Thanks <client>", id);
    assert.equal(accepted.status, "accepted");
    await sendConversationReply(loaded, first, "Thanks <client>", id);
    assert.equal(submissions, 1);
    await assert.rejects(sendConversationReply(loaded, first, "Changed body", id), /different message/);
    global.fetch = async (url, options) => {
      if (options?.method === "POST") { submissions++; throw new Error("Connection lost after submit"); }
      const target = String(url);
      if (target.includes("/leads/?")) return Response.json({ id: 9, email: first.from, lead_campaign_data: [{ campaign_id: 123 }] });
      if (target.includes("message-history")) return Response.json({ from: "info@brand-a.example", to: first.from, history: [{ stats_id: "765", type: "REPLY" }] });
      return Response.json([{ from_email: "info@brand-a.example" }]);
    };
    const uncertainId = randomUUID();
    assert.equal((await sendConversationReply(loaded, first, "Follow up", uncertainId)).status, "unknown");
    await sendConversationReply(loaded, first, "Follow up", uncertainId);
    assert.equal(submissions, 2);
    assert.equal((await listInboxSends(first)).length, 2);
    global.fetch = async (url, options) => {
      if (options?.method === "POST") return Response.json({ error: "Rejected" }, { status: 400 });
      const target = String(url);
      if (target.includes("/leads/?")) return Response.json({ id: 9, email: first.from, lead_campaign_data: [{ campaign_id: 123 }] });
      if (target.includes("message-history")) return Response.json({ from: "info@brand-a.example", to: first.from, history: [{ stats_id: "765", type: "REPLY" }] });
      return Response.json([{ from_email: "info@brand-a.example" }]);
    };
    assert.equal((await sendConversationReply(loaded, first, "Rejected reply", randomUUID())).status, "failed");
    global.fetch = async (url) => {
      const target = String(url);
      if (target.includes("/leads/?")) return Response.json({ id: 9, email: first.from, lead_campaign_data: [{ campaign_id: 123 }] });
      if (target.includes("message-history")) return Response.json({ from: "info@brand-a.example", to: first.from, history: [{ stats_id: "765", type: "REPLY" }] });
      return Response.json([{ from_email: "info@brand-b.example" }]);
    };
    await assert.rejects(sendConversationReply(loaded, first, "Wrong sender", randomUUID()), /this brand only/);
    // A later positive reply cannot remove an earlier suppression.
    await saveInbound({ ...incoming, id: "optout", body: "STOP" });
    await saveInbound({ ...incoming, id: "later", body: "yes" });
    assert.equal((await ensureStore()).leads[0].optedOut, true);
  } finally {
    global.fetch = originalFetch; process.chdir(previousCwd);
    if (previousDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDb;
    delete process.env.SMARTLEAD_API_KEY;
  }
});

test("operator replies stay off in previews and respect the production test rollout", async () => {
  const { inboxSendingDisabledReason } = await import("../src/lib/inbox-service");
  const keys = ["NODE_ENV", "VERCEL", "VERCEL_ENV", "INBOX_REPLIES_ENABLED", "INBOX_REPLY_ENTITIES", "INBOX_REPLY_CHANNELS", "INBOX_REPLY_TEST_RECIPIENTS", "ACTIVE_SENDING_ENTITIES"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const reply = { brandId: "a", channel: "email", from: "client@example.com" } as import("../src/lib/types").Reply;
  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", INBOX_REPLIES_ENABLED: "true" });
    assert.match(inboxSendingDisabledReason(reply)!, /preview/);
    process.env.VERCEL_ENV = "production"; delete process.env.INBOX_REPLIES_ENABLED;
    assert.match(inboxSendingDisabledReason(reply)!, /activation/);
    Object.assign(process.env, { INBOX_REPLIES_ENABLED: "true", INBOX_REPLY_ENTITIES: "a", INBOX_REPLY_CHANNELS: "email", INBOX_REPLY_TEST_RECIPIENTS: reply.from });
    assert.equal(inboxSendingDisabledReason(reply), undefined);
    assert.match(inboxSendingDisabledReason({ ...reply, brandId: "b" })!, /business/);
    assert.match(inboxSendingDisabledReason({ ...reply, channel: "sms" })!, /channel/);
    assert.match(inboxSendingDisabledReason({ ...reply, from: "another@example.com" })!, /test contact/);
  } finally { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
});

test("Smartlead empty success acknowledges acceptance while malformed confirmations remain uncertain", async () => {
  const { submitInboxReply } = await import("../src/lib/providers/inbox");
  const originalFetch = global.fetch, originalKey = process.env.SMARTLEAD_API_KEY;
  process.env.SMARTLEAD_API_KEY = "test-key";
  const reply = { channel: "email", from: "client@example.com" } as import("../src/lib/types").Reply;
  const thread = { campaignId: "123", statsId: "765", mailbox: "info@brand-a.example" };
  try {
    global.fetch = async () => new Response(null, { status: 200 });
    assert.equal(await submitInboxReply(reply, brands[0], "Test", thread), undefined);
    global.fetch = async () => new Response("<html>Unexpected proxy response</html>", { status: 200 });
    await assert.rejects(submitInboxReply(reply, brands[0], "Test", thread), /no confirmation/);
    global.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(submitInboxReply(reply, brands[0], "Test", thread), /rejected/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SMARTLEAD_API_KEY; else process.env.SMARTLEAD_API_KEY = originalKey;
  }
});
