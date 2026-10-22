import { test } from "node:test";
import assert from "node:assert/strict";
import type { Lead } from "../src/lib/types";
import { applyVerification, contactOkForChannel } from "../src/lib/verify";

function contact(patch: Partial<Lead> = {}): Lead {
  return { id: "verification-fixture", email: "contact@business.invalid", phone: "+12125550123",
    source: "fixture", groupName: "fixture", purchaseDate: "2026-10-21", costCents: 0,
    offeredEntityIds: [], lastEntityId: null, convertedEntityId: null, status: "available",
    optedOut: false, emailStatus: "valid", phoneStatus: "valid", createdAt: "2026-10-21T00:00:00Z", ...patch };
}

test("local rechecks cannot rehabilitate a rejected mailbox or refresh its evidence date", () => {
  const lead = contact({ emailStatus: "invalid", verifyNotes: "Mailbox not found",
    verifiedAt: "2026-10-20T00:00:00Z" });
  const checked = applyVerification(lead);
  assert.equal(checked.emailStatus, "invalid");
  assert.equal(checked.phoneStatus, "valid", "the other contact channel stays usable");
  assert.equal(checked.verifiedAt, lead.verifiedAt);
  assert.match(checked.verifyNotes!, /Mailbox not found/);
  assert.equal(contactOkForChannel(checked, "email", true), false);
  assert.equal(contactOkForChannel(checked, "email", false), false, "disabling verified-only never overrides a rejection");
  assert.equal(contactOkForChannel(checked, "sms", true), true);
});

test("rejected phones remain blocked independently of email and campaign preferences", () => {
  const checked = applyVerification(contact({ phoneStatus: "invalid" }));
  assert.equal(checked.phoneStatus, "invalid");
  assert.equal(checked.emailStatus, "valid");
  assert.equal(contactOkForChannel(checked, "sms", false), false);
  assert.equal(contactOkForChannel(checked, "email", true), true);
});

test("format screening still detects bad contacts and does not imply external verification", () => {
  const checked = applyVerification(contact({ email: "bad address", phone: "123" }));
  assert.equal(checked.emailStatus, "invalid");
  assert.equal(checked.phoneStatus, "invalid");
  const fresh = applyVerification(contact({ emailStatus: "unverified", phoneStatus: "unverified" }));
  assert.match(fresh.verifyNotes!, /local check/);
  assert.equal(fresh.emailStatus, "valid");
});
