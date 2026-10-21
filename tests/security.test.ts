import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { encodeSession, decodeSession } from "../src/lib/auth";
import { validEmailWebhook, validTelnyxWebhook } from "../src/lib/webhook-security";
import { resolveCompanyCampaign } from "../src/lib/providers/email";
import { deliverCampaignBatch } from "../src/lib/send";
import { createSeedData } from "../src/lib/seed";

test("production sessions require a dedicated secret and reject forged/expired tokens", () => {
  Object.assign(process.env, { NODE_ENV: "production" });
  delete process.env.AUTH_SECRET;
  const session = { userId: "one", email: "one@example.com", role: "admin" as const, allowedEntityIds: [], exp: Date.now() + 60000 };
  assert.throws(() => encodeSession(session), /AUTH_SECRET/);
  process.env.AUTH_SECRET = "x".repeat(40);
  const token = encodeSession(session);
  assert.equal(decodeSession(token)?.userId, "one");
  assert.equal(decodeSession(`${token.slice(0, -8)}deadbeef`), null);
  assert.equal(decodeSession(encodeSession({ ...session, exp: Date.now() - 1 })), null);
  assert.equal(decodeSession("arbitrary-cookie"), null);
});

test("Telnyx requires an authentic raw-body signature within the timestamp window", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  process.env.TELNYX_PUBLIC_KEY = publicKey.export({ format: "pem", type: "spki" }).toString();
  const raw = '{"data":{"id":"event-one"}}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = new Headers({ "telnyx-timestamp": timestamp, "telnyx-signature-ed25519": sign(null, Buffer.from(`${timestamp}|${raw}`), privateKey).toString("base64") });
  assert.equal(validTelnyxWebhook(raw, headers), true);
  assert.equal(validTelnyxWebhook(raw + " ", headers), false);
  assert.equal(validTelnyxWebhook(raw, headers, Date.now() + 601000), false);
  delete process.env.TELNYX_PUBLIC_KEY;
  assert.equal(validTelnyxWebhook(raw, headers), false);
});

test("email webhook rejects missing credentials and accepts a configured bearer credential", () => {
  process.env.EMAIL_WEBHOOK_SECRET = "e".repeat(40);
  assert.equal(validEmailWebhook(new Request("https://example.com/api/webhooks/email")), false);
  assert.equal(validEmailWebhook(new Request("https://example.com/api/webhooks/email", { headers: { authorization: `Bearer ${process.env.EMAIL_WEBHOOK_SECRET}` } })), true);
});

test("provider campaigns cannot be shared across company identities", () => {
  process.env.SMARTLEAD_CAMPAIGN_ABSTRACT = "123";
  process.env.SMARTLEAD_CAMPAIGN_AHAVA = "123";
  assert.throws(() => resolveCompanyCampaign("SMARTLEAD", "abstract"), /distinct campaign/);
  process.env.SMARTLEAD_CAMPAIGN_AHAVA = "456";
  assert.equal(resolveCompanyCampaign("SMARTLEAD", "abstract"), "123");
  assert.equal(resolveCompanyCampaign("SMARTLEAD", "unknown"), undefined);
});

test("a missing production provider never counts a mock send as delivered", async () => {
  delete process.env.TELNYX_API_KEY;
  const data = createSeedData();
  const lead = { ...data.leads[0], id: "test", phone: "+12125551234", phoneStatus: "valid" as const, optedOut: false, status: "available" as const,
    smsConsents: [{ id: "fixture", brandId: data.brands[0].id, phone: "+12125551234", status: "granted" as const,
      recordedAt: new Date().toISOString(), sourceUrl: "https://fixture.example.invalid/sms", disclosure: "Fixture SMS consent", disclosureVersion: "fixture-v1", method: "web_form" as const }] };
  const brand = { ...data.brands[0], phoneNumbers: ["+12125550000"] };
  const campaign = { ...data.campaigns[0], channel: "sms" as const, preferVerified: true };
  const result = await deliverCampaignBatch({ campaign, brand, leads: [lead] });
  assert.equal(result.delivered, 0);
  assert.equal(result.results[0].status, "mock");
});

 test("company rollout allowlist and preview guard prevent unintended sending", async () => {
  const { sendingEnabled, sendingEntityEnabled } = await import("../src/lib/dispatch-scheduler");
  process.env.ACTIVE_SENDING_ENTITIES = "abstract";
  assert.equal(sendingEntityEnabled("abstract"), true);
  assert.equal(sendingEntityEnabled("ahava"), false);
  Object.assign(process.env, { SENDING_ENABLED: "true", VERCEL: "1", VERCEL_ENV: "preview" });
  assert.equal(sendingEnabled(), false);
  process.env.VERCEL_ENV = "production";
  assert.equal(sendingEnabled(), true);
  delete process.env.ACTIVE_SENDING_ENTITIES;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
});
