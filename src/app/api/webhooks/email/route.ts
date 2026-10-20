import { NextResponse } from "next/server";
import { ingestReply } from "@/lib/neon-store-ops";
import { validEmailWebhook, processWebhook } from "@/lib/webhook-security";

/**
 * Cold-email reply webhook (Smartlead / Instantly / simple test JSON).
 *
 * Smartlead EMAIL_REPLY: lead is `to_email` (mailbox that replied);
 * body is `reply_message.text` / `preview_text` / `reply_body`.
 * Instantly / manual test: `from`|`email` + `text`|`body`.
 *
 * Point Smartlead webhook URL to: https://YOUR_PUBLIC_HOST/api/webhooks/email
 * Event: EMAIL_REPLY (optionally LEAD_CATEGORY_UPDATED for interested).
 */

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function brandIdFromSmartleadCampaign(
  campaignId: string | number | undefined,
): string | undefined {
  if (campaignId === undefined || campaignId === null || campaignId === "") {
    return undefined;
  }
  const id = String(campaignId).trim();
  const entities = [
    "abstract",
    "ahava",
    "takemore",
    "venture",
    "tyh",
  ] as const;
  const matches: string[] = [];
  for (const entity of entities) {
    const prefix = `SMARTLEAD_CAMPAIGN_${entity.toUpperCase()}`;
    if (Object.entries(process.env).some(([key, value]) => (key === prefix || key.startsWith(`${prefix}__`)) && value?.trim() === id)) matches.push(entity);
  }
  return matches.length === 1 ? matches[0] : undefined;
}

export async function POST(request: Request) {
  if (!validEmailWebhook(request)) return NextResponse.json({ error: "Invalid webhook credential" }, { status: 401 });
  const raw = await request.text();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const body = parsed as {
    // Simple / Instantly-style
    from?: string;
    email?: string;
    text?: string;
    body?: string;
    brandId?: string;
    campaignId?: string;
    // Smartlead EMAIL_REPLY (+ related)
    event_type?: string;
    to_email?: string;
    lead_email?: string;
    from_email?: string;
    preview_text?: string;
    reply_body?: string;
    campaign_id?: string | number;
    reply_message?: { text?: string; html?: string };
    lastReply?: { email_body?: string; type?: string };
  };

  const event = (body.event_type || "").toUpperCase();

  // Ignore non-reply Smartlead events (opens, sent, etc.) so one webhook URL works
  if (
    event &&
    !["EMAIL_SENT", "FIRST_EMAIL_SENT", "EMAIL_BOUNCE", "LEAD_UNSUBSCRIBED"].includes(event) &&
    event !== "EMAIL_REPLY" &&
    event !== "UNTRACKED_REPLIES" &&
    event !== "LEAD_CATEGORY_UPDATED"
  ) {
    return NextResponse.json({
      ignored: true,
      reason: `event_type ${event}`,
    });
  }

  // Smartlead: the lead who replied is `to_email` (from_email is your mailbox)
  const from =
    body.to_email ||
    body.lead_email ||
    body.from ||
    body.email ||
    "";

  let text =
    body.reply_message?.text ||
    body.preview_text ||
    body.text ||
    body.body ||
    "";

  if (!text && body.reply_message?.html) {
    text = stripHtml(body.reply_message.html);
  }
  if (!text && body.reply_body) {
    text = stripHtml(body.reply_body);
  }
  if (!text && body.lastReply?.email_body) {
    text = stripHtml(body.lastReply.email_body);
  }
  if (!text && event === "LEAD_CATEGORY_UPDATED") {
    text = `[Smartlead category update]`;
  }

  const brandId = brandIdFromSmartleadCampaign(body.campaign_id);
  if (!brandId) return NextResponse.json({ error: "Unknown provider campaign mapping" }, { status: 400 });
  if (["EMAIL_SENT", "FIRST_EMAIL_SENT", "EMAIL_BOUNCE", "LEAD_UNSUBSCRIBED"].includes(event)) {
    if (!from) return NextResponse.json({ error: "Missing lead email" }, { status: 400 });
    const outcome = await processWebhook("email", raw, undefined, async tx => {
      const lead = await tx.lead.findFirst({ where: { email: { equals: from, mode: "insensitive" } } });
      if (!lead) return { ignored: true };
      const job = await tx.sendJob.findFirst({ where: { leadId: lead.id, entityId: brandId, channel: "email", payload: { path: ["providerCampaignId"], equals: String(body.campaign_id) } }, orderBy: { createdAt: "desc" } });
      if (event === "LEAD_UNSUBSCRIBED") {
        await tx.lead.update({ where: { id: lead.id }, data: { optedOut: true, status: "opted_out" } });
        await tx.optOut.create({ data: { id: `opt-${crypto.randomUUID()}`, contact: from, channel: "email", reason: "Smartlead unsubscribe", brandId } });
        await tx.sendJob.updateMany({ where: { leadId: lead.id, status: "queued" }, data: { status: "skipped", error: "Contact unsubscribed", finishedAt: new Date() } });
      } else if (event === "EMAIL_BOUNCE") {
        await tx.lead.update({ where: { id: lead.id }, data: { emailStatus: "invalid" } });
        if (job) await tx.sendJob.update({ where: { id: job.id }, data: { status: "bounced", error: "Provider reported email bounce", finishedAt: new Date() } });
        await tx.sendJob.updateMany({ where: { leadId: lead.id, channel: "email", status: "queued" }, data: { status: "skipped", error: "Email bounced", finishedAt: new Date() } });
      } else if (job) {
        await tx.sendJob.updateMany({ where: { id: job.id, status: "accepted" }, data: { status: "sent", finishedAt: new Date() } });
      }
      return { applied: true };
    });
    return NextResponse.json({ ok: true, duplicate: outcome.duplicate });
  }

  if (!from || !text) {
    return NextResponse.json(
      {
        error:
          "Missing lead email and reply text — expected Smartlead EMAIL_REPLY or { from/email, text/body }",
      },
      { status: 400 },
    );
  }

  // Smartlead campaign_id is NOT our Prisma campaign id — only use it to
  // map → entity via SMARTLEAD_CAMPAIGN_* env. Never pass it as campaignId.
  const outcome = await processWebhook("email", raw, undefined, async tx => {
    const lead = await tx.lead.findFirst({ where: { email: { equals: from, mode: "insensitive" } } });
    const job = lead ? await tx.sendJob.findFirst({ where: { leadId: lead.id, entityId: brandId, channel: "email", payload: { path: ["providerCampaignId"], equals: String(body.campaign_id) } }, orderBy: { createdAt: "desc" } }) : null;
    return ingestReply({ channel: "email", from, body: text, brandId, campaignId: job?.campaignId }, tx);
  });
  return NextResponse.json({ ok: true, duplicate: outcome.duplicate });
}
