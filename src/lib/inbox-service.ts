import { normalizeContact } from "@/lib/eligibility";
import { listInboxSends, reserveInboxSend, finishInboxSend } from "@/lib/inbox-store";
import { resolveEmailThread, submitInboxReply, InboxProviderError } from "@/lib/providers/inbox";
import type { PlatformData, Reply, InboxSend } from "@/lib/types";
import { isProductionDeploy } from "@/lib/auth";

export function inboxSendingDisabledReason(reply: Reply): string | undefined {
  if (process.env.VERCEL_ENV === "preview" || (process.env.VERCEL === "1" && process.env.VERCEL_ENV !== "production")) return "Sending is disabled in preview environments.";
  if (isProductionDeploy() && process.env.INBOX_REPLIES_ENABLED !== "true") return "Inbox replies are awaiting activation.";
  const allowed = (name: string) => process.env[name]?.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  const entities = allowed("INBOX_REPLY_ENTITIES") || allowed("ACTIVE_SENDING_ENTITIES");
  if (entities?.length && !entities.includes(reply.brandId.toLowerCase())) return "Replies are not activated for this business yet.";
  const channels = allowed("INBOX_REPLY_CHANNELS");
  if (channels?.length && !channels.includes(reply.channel)) return "Replies are not activated for this channel yet.";
  const testRecipients = allowed("INBOX_REPLY_TEST_RECIPIENTS");
  if (testRecipients?.length && !testRecipients.includes(reply.from.toLowerCase())) return "Inbox replies are limited to the configured test contact while verification is in progress.";
}

export function assertReplyAllowed(data: PlatformData, reply: Reply) {
  const lead = data.leads.find((l) => l.id === reply.leadId);
  const contact = normalizeContact(reply.from);
  if (!lead) throw new Error("Lead not found");
  if (lead.optedOut || lead.status === "opted_out" || reply.sentiment === "opt_out" || data.replies.some((r) =>
    r.leadId === reply.leadId && r.channel === reply.channel && r.sentiment === "opt_out") || data.optOuts.some((o) =>
    normalizeContact(o.contact) === contact && (o.channel === "both" || o.channel === reply.channel)))
    throw new Error("This contact opted out. Replies are disabled.");
}

export async function sendConversationReply(data: PlatformData, reply: Reply, body: string, requestId: string): Promise<InboxSend> {
  const disabled = inboxSendingDisabledReason(reply);
  if (disabled) throw new Error(disabled);
  if (!body.trim() || body.length > (reply.channel === "sms" ? 1600 : 20_000)) throw new Error("Enter a reply within the message length limit");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new Error("Invalid send request ID");
  assertReplyAllowed(data, reply);
  const brand = data.brands.find((b) => b.id === reply.brandId);
  if (!brand) throw new Error("Entity not found");
  const previous = (await listInboxSends(reply, data.replies)).find((s) => s.id === requestId);
  if (previous) {
    if (previous.replyId !== reply.id || previous.body !== body.trim()) throw new Error("Send request already used for a different message");
    return previous;
  }
  const thread = reply.channel === "email" ? await resolveEmailThread(reply, brand) : undefined;
  const from = thread?.mailbox || reply.providerContext?.mailbox;
  if (!from) throw new Error("This older reply has no receiving identity. A new verified inbound message is needed before replying.");
  const { send, created } = await reserveInboxSend({ id: requestId, replyId: reply.id, brandId: reply.brandId,
    leadId: reply.leadId, channel: reply.channel, body: body.trim(), from, to: reply.from,
    status: "sending", createdAt: new Date().toISOString() });
  if (send.replyId !== reply.id || send.body !== body.trim()) throw new Error("Send request already used");
  if (!created) return send;
  // Once reserved, the same request is never transmitted twice, including after a timeout.
  let outcome: Pick<InboxSend, "status" | "providerId" | "error">;
  try {
    const providerId = await submitInboxReply(reply, brand, body.trim(), thread);
    outcome = { status: "accepted", providerId };
  } catch (error) {
    outcome = { status: error instanceof InboxProviderError && !error.uncertain ? "failed" : "unknown",
      error: error instanceof InboxProviderError ? error.message : "Message status could not be confirmed. Check before sending again." };
  }
  try { return await finishInboxSend(send.id, outcome); }
  catch { return { ...send, status: "unknown", error: "Message was submitted but its status could not be saved. Check before sending again." }; }
}
