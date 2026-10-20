import { test } from "node:test";
import assert from "node:assert/strict";
import { clearSmartleadSequenceSyncCache, sendColdEmail } from "../src/lib/providers/email";

test("Smartlead delivery pauses and starts with POST and updates the existing HTML sequence", async () => {
  process.env.SMARTLEAD_API_KEY = "contract-test-only";
  delete process.env.INSTANTLY_API_KEY;
  clearSmartleadSequenceSyncCache();
  const originalFetch = globalThis.fetch;
  const statuses: string[] = [];
  let contacts = 0;
  globalThis.fetch = async (input, init) => {
    const route = new URL(String(input)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (route.endsWith("/status")) {
      assert.equal(init?.method, "POST");
      statuses.push(body.status);
      return Response.json({ ok: true });
    }
    if (route.endsWith("/sequences")) {
      if (!init?.method) return Response.json([{ id: 42, seq_number: 1 }]);
      assert.equal(body.sequences.length, 1);
      assert.equal(body.sequences[0].id, 42);
      assert.equal(body.sequences[0].email_body, '<p>Hi {{first_name}}</p>');
      return Response.json({ ok: true });
    }
    if (route.endsWith("/leads")) {
      assert.deepEqual(statuses, ["PAUSED", "START"]);
      assert.equal(body.lead_list.length, 1);
      assert.equal(body.lead_list[0].email, "fixture@customer.invalid");
      contacts++;
      return Response.json({ ok: true, upload_count: 1 });
    }
    assert.equal(route, "/api/v1/campaigns/contract-fixture");
    return Response.json({ status: "ACTIVE" });
  };
  try {
    const result = await sendColdEmail({ to: "fixture@customer.invalid", subject: "A fixture", body: "Hello", htmlBody: '<p>Hi {{firstName}}</p>', providerCampaignId: "contract-fixture" });
    assert.equal(result.ok, true);
    assert.equal(contacts, 1);
  } finally {
    globalThis.fetch = originalFetch;
    clearSmartleadSequenceSyncCache();
  }
});
