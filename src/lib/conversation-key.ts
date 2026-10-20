import type { Reply } from "@/lib/types";

/** Keep drafts/history separate when one lead talks to multiple brands or campaigns. */
export function conversationKey(reply: Reply): string {
  return JSON.stringify([reply.brandId, reply.leadId, reply.channel,
    reply.providerContext?.campaignId || reply.campaignId, reply.providerContext?.mailbox?.toLowerCase() || ""]);
}
