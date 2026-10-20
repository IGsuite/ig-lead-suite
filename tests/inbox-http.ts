import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";

// Local build smoke test only; never post fixtures to a customer deployment.
const base = "http://127.0.0.1:43125";
async function post(route: string, body: unknown, cookie?: string) {
  return fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
}
async function main() {
  const input = { event_type: "EMAIL_REPLY", to_email: "inbox-check@example.com", from_email: "info@abstractcapitalgroup.com",
    reply_body: "<p>Can you send an overview?</p>", campaign_id: 4141572, time_replied: "2026-10-20T02:00:00Z" };
  const first = await post("/api/webhooks/email", input);
  assert.equal(first.status, 200);
  const { reply } = await first.json();
  const retry = await (await post("/api/webhooks/email", input)).json();
  assert.equal(retry.reply.id, reply.id);
  assert.equal(reply.brandId, "abstract");
  const route = `/api/replies/${reply.id}/conversation`;
  const conversation = await (await fetch(base + route)).json();
  assert.equal(conversation.from, "info@abstractcapitalgroup.com");
  assert.equal(conversation.inbound.filter((r: { id: string }) => r.id === reply.id).length, 1);
  const payload = Buffer.from(JSON.stringify({ userId: "test-member", email: "member@example.com", role: "member", allowedEntityIds: ["ahava"], exp: Date.now() + 100_000 })).toString("base64url");
  const cookie = `sd_session=${payload}.${createHmac("sha256", "signaldesk-local-dev-secret").update(payload).digest("hex")}`;
  assert.equal((await fetch(base + route, { headers: { Cookie: cookie } })).status, 403);
  assert.equal((await post(route, { body: "Unauthorized reply", requestId: randomUUID() }, cookie)).status, 403);
  assert.equal((await post("/api/webhooks/email", { ...input, from_email: "info@unknown.example" })).status, 422);
  const receipt = await (await post("/api/webhooks/telnyx", { data: { event_type: "message.finalized" } })).json();
  assert.equal(receipt.ignored, true);
  // No provider credentials are set in this test server: a send must fail closed.
  const blocked = await post(route, { body: "Local smoke test", requestId: randomUUID() });
  assert.equal(blocked.status, 422);
  assert.match((await blocked.json()).error, /not configured/);
  console.log("PASS: local webhook deduplication, conversation identity, HTTP read/send isolation, unknown brand rejection, delivery receipt filtering and unconfigured send rejection");
}
void main();
