import { NextResponse } from "next/server";
import { ingestReply } from "@/lib/store";

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
  const defaultId = process.env.SMARTLEAD_CAMPAIGN_ID?.trim();
  if (defaultId && defaultId === id) {
    // Default campaign — leave brand resolution to ingestReply (last entity / offered)
    return undefined;
  }
  const entities = [
    "abstract",
    "ahava",
    "takemore",
    "venture",
    "tyh",
  ] as const;
  for (const entity of entities) {
    const envVal =
      process.env[`SMARTLEAD_CAMPAIGN_${entity.toUpperCase()}`]?.trim();
    if (envVal && envVal === id) return entity;
  }
  return undefined;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
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
  const brandId =
    body.brandId || brandIdFromSmartleadCampaign(body.campaign_id);

  const reply = await ingestReply({
    channel: "email",
    from,
    body: text,
    brandId,
    // Only accept our own campaign ids from simple/test payloads
    campaignId: body.campaignId,
  });

  return NextResponse.json({ ok: true, reply });
}
