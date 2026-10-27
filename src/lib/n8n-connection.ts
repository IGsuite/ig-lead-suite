import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Kept outside the checklist credential namespace: assistants cannot replace or reveal it.
export const N8N_CREDENTIAL_KEY = "internal_n8n_reports_v1";
export const n8nConfigSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revoked: z.boolean(),
}).strict();
export type N8nConfig = z.infer<typeof n8nConfigSchema>;

export function newN8nAccess(entityId: string, now = new Date()) {
  const token = `suite_n8n.${entityId}.${randomBytes(32).toString("base64url")}`;
  const config: N8nConfig = {
    hash: createHash("sha256").update(token).digest("hex"),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 90 * 86400000).toISOString(),
    revoked: false,
  };
  return { token, config };
}
export function n8nTokenCompany(authorization: string | null) {
  return /^Bearer suite_n8n\.([a-z0-9-]{1,100})\.[A-Za-z0-9_-]{43}$/.exec(authorization || "")?.[1] || null;
}
export function validN8nAccess(token: string, entityId: string, config: N8nConfig, now = new Date()) {
  if (n8nTokenCompany(`Bearer ${token}`) !== entityId || config.revoked || Date.parse(config.expiresAt) <= now.getTime()) return false;
  return timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(config.hash, "hex"));
}

// No recipient data, verification decisions, campaign actions or arbitrary error payloads.
export const n8nReportInput = z.object({
  entityId: z.string().regex(/^[a-z0-9-]{1,100}$/),
  eventId: z.string().regex(/^[A-Za-z0-9_.:-]{1,150}$/),
  type: z.enum(["connection_test", "workflow_completed", "workflow_failed"]),
  workflow: z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N} _().:—–-]+$/u),
}).strict();
export function n8nReportRecord(report: z.infer<typeof n8nReportInput>) {
  return {
    id: `n8n:${report.entityId}:${report.type}:${createHash("sha256").update(report.eventId).digest("hex").slice(0, 32)}`,
    entityId: report.entityId,
    itemKey: "n8n",
    message: report.type === "connection_test"
      ? "n8n marketing connection test received. Lead verification and campaigns were not run."
      : `n8n marketing workflow “${report.workflow}” ${report.type === "workflow_failed" ? "needs attention. Open its execution in the marketing n8n workspace." : "reported completion. This notice does not certify contacts or message delivery."}`,
  };
}

/** Importable, inactive, credential-free tests. Selecting a credential is an explicit n8n step. */
export function n8nStarterWorkflow(entityId: string, origin: string, kind: "test" | "errors" = "test") {
  const error = kind === "errors";
  return {
    name: `IG Lead Suite — ${entityId} — ${error ? "workflow failure notices" : "connection test only"}`,
    active: false,
    nodes: [
      { id: "start", name: error ? "Workflow error" : "Run connection test", type: error ? "n8n-nodes-base.errorTrigger" : "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [240, 300], parameters: {} },
      {
        id: "report", name: "Report to this company in Lead Suite", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [540, 300],
        parameters: {
          method: "POST", url: `${origin}/api/webhooks/n8n`, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
          sendBody: true, specifyBody: "json",
          jsonBody: `={{ JSON.stringify({entityId: ${JSON.stringify(entityId)}, eventId: String($execution.id), type: ${JSON.stringify(error ? "workflow_failed" : "connection_test")}, workflow: ${JSON.stringify(error ? "Marketing workflow" : "Lead Suite connection test")} }) }}`,
          options: { timeout: 10000 },
        },
      },
      { id: "instructions", name: "Setup instructions", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: [220, 60], parameters: { width: 650, height: 180, content: `## Lead Suite marketing only\nSelect an HTTP Header Auth credential on the report node. Header name: Authorization. Value: Bearer followed by this company's connection key. Store the key in the credential, never in this workflow. ${error ? "Select this as the error workflow in your marketing workflows' settings." : "Run manually once; this test uses no leads or paid services."}\nNo campaigns, contact verification, messages or command-center connections are enabled.` } },
    ],
    connections: { [error ? "Workflow error" : "Run connection test"]: { main: [[{ node: "Report to this company in Lead Suite", type: "main", index: 0 }]] } },
    settings: { executionOrder: "v1", timezone: "America/New_York", saveDataSuccessExecution: "none", saveDataErrorExecution: "none" },
    pinData: {},
  };
}
