import type { Brand } from "@/lib/types";
import { emailAddress, inboundReplyId, plainEmail, resolveReplyBrand, type InboundReply } from "@/lib/reply-routing";

type Fields = Record<string, unknown>;
const object = (value: unknown): Fields => value && typeof value === "object" && !Array.isArray(value) ? value as Fields : {};
const str = (...values: unknown[]): string => {
  const value = values.find((v) => (typeof v === "string" || typeof v === "number") && String(v).trim());
  return value === undefined ? "" : String(value).trim();
};

export function parseEmailReply(raw: unknown, brands: Brand[]): InboundReply | null {
  const body = object(raw);
  const event = str(body.event_type).toUpperCase();
  if (event && !["EMAIL_REPLY", "UNTRACKED_REPLIES"].includes(event)) return null;
  const smartlead = Boolean(event);
  const message = object(body.reply_message);
  const from = emailAddress(str(smartlead ? body.to_email : body.from, body.lead_email, body.email));
  const mailbox = emailAddress(str(smartlead ? body.from_email : body.to, body.mailbox));
  const text = str(message.text, body.text, plainEmail(str(message.html, body.reply_body, body.body)), body.preview_text);
  if (!from.includes("@") || !text || !mailbox) throw new Error("Reply needs lead email, full message and receiving mailbox");
  const campaignId = str(body.campaign_id);
  const brand = resolveReplyBrand(brands, { channel: "email", mailbox, providerCampaignId: campaignId,
    brandId: str(body.brandId) || undefined });
  const receivedAt = str(body.time_replied, body.received_at, body.timestamp);
  const messageId = str(body.message_id, message.message_id, body.reply_message_id);
  if (!messageId && !receivedAt) throw new Error("Reply needs a provider message ID or received timestamp to prevent duplicate imports");
  return { id: inboundReplyId("email", [brand.id, from, campaignId, messageId || receivedAt, text]),
    channel: "email", from, body: text, brandId: brand.id,
    campaignId: smartlead ? undefined : str(body.campaignId) || undefined,
    providerContext: { provider: smartlead ? "smartlead" : undefined, mailbox,
      campaignId: campaignId || undefined, leadId: str(body.lead_id) || undefined,
      emailStatsId: str(body.email_stats_id, message.email_stats_id) || undefined,
      messageId: messageId || undefined, subject: str(body.subject) || undefined, receivedAt: receivedAt || undefined } };
}

export function parseSmsReply(raw: unknown, brands: Brand[]): InboundReply | null {
  const body = object(raw), data = object(body.data), payload = object(data.payload);
  if (str(data.event_type) !== "message.received" || str(payload.direction) === "outbound") return null;
  const from = str(object(payload.from).phone_number);
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  if (recipients.length !== 1) throw new Error("Inbound message needs one receiving number");
  const mailbox = str(object(recipients[0]).phone_number), text = str(payload.text);
  if (!from || !text || !mailbox) throw new Error("Inbound message is missing sender, receiver or text");
  const brand = resolveReplyBrand(brands, { channel: "sms", mailbox });
  const messageId = str(payload.id, data.id);
  if (!messageId) throw new Error("Inbound message ID is missing");
  return { id: inboundReplyId("telnyx", [brand.id, messageId]), channel: "sms", from, body: text,
    brandId: brand.id, providerContext: { provider: "telnyx", mailbox, messageId, receivedAt: str(data.occurred_at) || undefined } };
}
