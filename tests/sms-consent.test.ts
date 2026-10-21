import { test } from "node:test";
import assert from "node:assert/strict";
import { hasSmsMarketingConsent, smsPhone } from "../src/lib/sms-consent";
import { isLeadEligibleForEntity } from "../src/lib/eligibility";
import type { Lead, SmsConsent } from "../src/lib/types";
import { POST } from "../src/app/api/sms/subscribe/route";

const consent: SmsConsent = { id: "test", brandId: "abstract", phone: "+12125550101", status: "granted", recordedAt: "2026-01-01T00:00:00Z", sourceUrl: "https://example.invalid/sms", disclosure: "SMS marketing consent", disclosureVersion: "v1", method: "web_form" };
const lead = { id: "test", phone: consent.phone, status: "available", phoneStatus: "valid", emailStatus: "valid", email: "test@example.invalid", source: "Manual", groupName: "Manual", offeredEntityIds: [], smsConsents: [consent] } as unknown as Lead;
const options = { channel: "sms" as const, sourceFilter: "all", preferUnoffered: false };

test("SMS permission is affirmative, brand- and phone-specific, and withdrawable", () => {
  assert.equal(smsPhone("(212) 555-0101"), consent.phone);
  assert.equal(hasSmsMarketingConsent(lead, "abstract"), true);
  assert.equal(hasSmsMarketingConsent(lead, "ahava"), false);
  assert.equal(hasSmsMarketingConsent({ ...lead, phone: "+12125550102" }, "abstract"), false);
  for (const patch of [{ smsConsents: [] }, { optedOut: true }, { status: "opted_out" as const }, { smsConsents: [{ ...consent, recordedAt: "2999-01-01" }] }, { smsConsents: [consent, { ...consent, status: "revoked" as const }] }])
    assert.equal(hasSmsMarketingConsent({ ...lead, ...patch }, "abstract"), false);
  assert.equal(isLeadEligibleForEntity({ ...lead, smsConsents: [] }, "abstract", options), false);
  assert.equal(isLeadEligibleForEntity(lead, "abstract", options), true);
  assert.equal(isLeadEligibleForEntity({ ...lead, smsConsents: [] }, "abstract", { ...options, channel: "email" }), true);
});

test("public signup does not record unchecked consent and rejects cross-origin or invalid intake", async () => {
  const make = (body: unknown, origin = "https://suite.example.invalid") => POST(new Request("https://suite.example.invalid/api/sms/subscribe", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  assert.equal((await make({ consent: false })).status, 200);
  assert.equal((await make({ consent: true, phone: "123", version: "old" })).status, 400);
  assert.equal((await make({ consent: true }, "https://other.example.invalid")).status, 403);
  assert.equal((await make({ consent: true, website: "spam" })).status, 400);
});
