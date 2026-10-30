export const DAY = 86400_000;
export type ConnectionFinding = {
  entityId: string; key: string; itemKey: string; title: string;
  state: "healthy" | "warning" | "action_needed"; detail: string;
};
export function credentialHealth(config: {revoked: boolean; expiresAt: string}, now = new Date()) {
  if (config.revoked) return {state: "action_needed" as const, detail: "Connection access was revoked. Reconnect in Company Setup."};
  const remaining = Date.parse(config.expiresAt) - now.getTime();
  if (!Number.isFinite(remaining) || remaining <= 0) return {state: "action_needed" as const, detail: "Connection access has expired. Renew the credential."};
  if (remaining <= 7 * DAY) return {state: "warning" as const, detail: "Connection access expires within seven days. Arrange renewal before it disconnects."};
  return {state: "healthy" as const, detail: "Connection credential is within its validity period."};
}
export function reportHealth(config: {receivedAt: string | null}, now = new Date()) {
  if (!config.receivedAt) return {state: "action_needed" as const, detail: "No report has reached Lead Suite. Finish authorization and run the first report test."};
  const age = now.getTime() - Date.parse(config.receivedAt);
  if (!Number.isFinite(age) || age < -300_000 || age > 2 * DAY) return {state: "action_needed" as const, detail: "No recent daily report has reached Lead Suite for over 48 hours. Check authorization and the provider schedule."};
  return {state: "healthy" as const, detail: "A report reached Lead Suite within the last 48 hours."};
}
// A single durable row per company/check. An acknowledgement survives unchanged failures.
// A recovery is visible once, and the next failure reopens the same row.
export function connectionEventChange(finding: ConnectionFinding, old: {message: string; acknowledgedAt: Date | null} | null, now = new Date()) {
  const message = `[${finding.state}] ${finding.title}: ${finding.detail}`;
  if (old?.message === message) return null;
  return {message, createdAt: now, acknowledgedAt: finding.state === "healthy" && !old ? now : null};
}
