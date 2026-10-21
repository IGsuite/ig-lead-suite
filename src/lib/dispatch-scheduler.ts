import { send } from "@vercel/queue";
import { dispatchWakeSlot } from "@/lib/dispatch-timing";

export const DISPATCH_TOPIC = "campaign-dispatch";
export function sendingEnabled() {
  return process.env.SENDING_ENABLED === "true" && (process.env.VERCEL !== "1" || process.env.VERCEL_ENV === "production");
}
/** Optional allowlist supports launching one company at a time. Empty means no restriction. */
export function activeSendingEntities() {
  return process.env.ACTIVE_SENDING_ENTITIES?.split(",").map(value => value.trim()).filter(Boolean);
}
export function sendingEntityEnabled(id: string) {
  const allowed = activeSendingEntities();
  return !allowed?.length || allowed.includes(id);
}
export function sendingChannelEnabled(channel: string) {
  const allowed = process.env.SENDING_CHANNELS?.split(",").map(v => v.trim()).filter(Boolean);
  return !allowed?.length || allowed.includes(channel);
}
export function assertCampaignSendingReady(entityId: string, channel: string) {
  if (!sendingEnabled()) throw new Error("Campaign sending is paused. Your campaign remains saved without sending.");
  if (!sendingEntityEnabled(entityId)) throw new Error("Sending is not enabled for this business yet.");
  if (!sendingChannelEnabled(channel)) throw new Error("Sending is not enabled for this channel yet.");
}
/** Queue holds only wake-up signals; contacts and immutable messages remain in Postgres. */
export async function wakeDispatcher(delaySeconds = 0, probe = false) {
  if (process.env.VERCEL !== "1") return { scheduled: false, reason: "local" };
  if (!probe && !sendingEnabled()) return { scheduled: false, reason: "paused" };
  const slot = dispatchWakeSlot(delaySeconds);
  const result = await send(DISPATCH_TOPIC, { kind: probe ? "probe" : "dispatch" }, {
    delaySeconds, retentionSeconds: 86400,
    idempotencyKey: `${probe ? "probe" : "dispatch"}:${process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL}:${slot}`,
  });
  return { scheduled: true, messageId: result.messageId };
}
