import { NextResponse } from "next/server";
import { parseEmailReply } from "@/lib/inbound-events";
import { mapEntity } from "@/lib/mappers";
import { ingestReply } from "@/lib/neon-store-ops";
import { validEmailWebhook, processWebhook } from "@/lib/webhook-security";
import { recordDeliveryAlert } from "@/lib/delivery-alerts";
import { getPrisma } from "@/lib/db";

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
    event !== "UNTRACKED_REPLIES"
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

  const configuredBrand = brandIdFromSmartleadCampaign(body.campaign_id);
  const setup = body.campaign_id ? await getPrisma().emailCampaignSetup.findUnique({ where: { providerCampaignId: String(body.campaign_id) } }) : null;
  if (setup && configuredBrand && configuredBrand !== setup.brandId) return NextResponse.json({ error: "Conflicting provider campaign mapping" }, { status: 400 });
  const brandId = setup?.brandId || configuredBrand;
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
        if (job) { await tx.sendJob.update({ where: { id: job.id }, data: { status: "bounced", error: "Provider reported email bounce", finishedAt: new Date() } }); await recordDeliveryAlert(tx,job,"Provider reported email bounce"); }
        await tx.sendJob.updateMany({ where: { leadId: lead.id, channel: "email", status: "queued" }, data: { status: "skipped", error: "Email bounced", finishedAt: new Date() } });
      } else if (job) {
        await tx.sendJob.updateMany({ where: { id: job.id, status: "accepted" }, data: { status: "sent", finishedAt: new Date() } });
      }
      return { applied: true };
    });
    return NextResponse.json({ ok: true, duplicate: outcome.duplicate });
  }

  const outcome = await processWebhook("email", raw, undefined, async tx => {
    const lead = await tx.lead.findFirst({ where: { email: { equals: from, mode: "insensitive" } } });
    const job = lead ? await tx.sendJob.findFirst({ where: { leadId: lead.id, entityId: brandId, channel: "email", payload: { path: ["providerCampaignId"], equals: String(body.campaign_id) } }, orderBy: { createdAt: "desc" } }) : null;
    const input = parseEmailReply({ ...parsed, brandId }, (await tx.entity.findMany()).map(mapEntity));
    if (!input) return { ignored: true };
    return ingestReply({ ...input, campaignId: job?.campaignId || setup?.campaignId }, tx);
  });
  return NextResponse.json({ ok: true, duplicate: outcome.duplicate });
}
