import test from "node:test";
import assert from "node:assert/strict";
import { n8nReportInput, n8nReportRecord, n8nStarterWorkflow, newN8nAccess, validN8nAccess, n8nTokenCompany } from "../src/lib/n8n-connection";

test("n8n report keys are company-bound, expire, revoke, and cannot authenticate a changed key", () => {
  const now = new Date("2026-10-26T12:00:00Z"), access = newN8nAccess("abstract", now);
  assert.equal(n8nTokenCompany(`Bearer ${access.token}`), "abstract");
  assert.equal(validN8nAccess(access.token, "abstract", access.config, now), true);
  assert.equal(validN8nAccess(access.token, "ahava", access.config, now), false);
  assert.equal(validN8nAccess(access.token + "x", "abstract", access.config, now), false);
  assert.equal(validN8nAccess(access.token, "abstract", { ...access.config, revoked: true }, now), false);
  assert.equal(validN8nAccess(access.token, "abstract", access.config, new Date(access.config.expiresAt)), false);
  assert.equal(JSON.stringify(access.config).includes(access.token), false);
});
test("n8n notices cannot claim contact verification or send actions and deduplicate per company", () => {
  const input = { entityId: "abstract", eventId: "execution-123", type: "workflow_failed", workflow: "Lead verification" };
  const parsed = n8nReportInput.parse(input);
  assert.equal(n8nReportRecord(parsed).id, n8nReportRecord(parsed).id);
  assert.notEqual(n8nReportRecord(parsed).id, n8nReportRecord({ ...parsed, entityId: "ahava" }).id);
  assert.equal(n8nReportInput.safeParse({ ...input, type: "verify_lead" }).success, false);
  assert.equal(n8nReportInput.safeParse({ ...input, email: "person@example.com" }).success, false);
  assert.equal(n8nReportInput.safeParse({ ...input, workflow: "https://example.com/?token=secret" }).success, false);
  assert.equal(n8nReportInput.safeParse({ ...input, type: "launch" }).success, false);
});
test("n8n starter downloads are inactive, contain no credentials and only call the report endpoint", () => {
  for (const kind of ["test", "errors"] as const) {
    const workflow = n8nStarterWorkflow("abstract", "https://suite.invalid", kind);
    assert.equal(workflow.active, false);
    assert.equal(workflow.nodes.filter(n => n.type === "n8n-nodes-base.httpRequest").length, 1);
    const node = workflow.nodes.find(n => n.type === "n8n-nodes-base.httpRequest")!;
    assert.equal(node.parameters.url, "https://suite.invalid/api/webhooks/n8n");
    assert.equal(JSON.stringify(workflow).includes("suite_n8n."), false);
    assert.equal("credentials" in node, false);
    assert.equal(JSON.stringify(workflow).includes("/api/campaigns"), false);
  }
});
