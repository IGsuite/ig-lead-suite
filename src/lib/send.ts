import { buildEmailBodies } from "@/lib/email-html";
import {
  emailProviderName,
  isColdEmailConfigured,
  renderEmailTemplate,
  sendColdEmail,
} from "@/lib/providers/email";
import {
  isTelnyxConfigured,
  renderSmsTemplate,
  sendTelnyxSms,
} from "@/lib/providers/telnyx";
import type { Brand, Campaign, Lead } from "@/lib/types";
import { contactOkForChannel } from "@/lib/verify";
import { hasSmsMarketingConsent } from "@/lib/sms-consent";

export type ContactSendResult = { leadId: string; status: "accepted" | "failed" | "skipped" | "mock" | "uncertain"; providerId?: string; error?: string };

export type CampaignSendSummary = {
  results: ContactSendResult[];
  attempted: number;
  delivered: number;
  failed: number;
  skipped: number;
  liveCap: number;
  mode: "live" | "mock" | "mixed";
  channel: Campaign["channel"];
  provider: string;
};

/** Default live provider calls per Launch batch (was 25 for early testing). */
export const LIVE_CAP_DEFAULT = 2000;

/**
 * Hard ceiling — `0` / `unlimited` / huge env values clamp here.
 * Keeps a safety net even when operators try to disable the cap.
 */
export const LIVE_CAP_MAX = 10_000;

function personalize(
  campaign: Campaign,
  brand: Brand,
  lead: Lead,
): { subject?: string; body: string; htmlBody?: string } {
  const vars = { firstName: lead.firstName, brand: brand.shortName };
  if (campaign.channel === "email") {
    const bodies = buildEmailBodies({
      message: campaign.message,
      htmlMessage: campaign.htmlMessage,
      imageUrl: campaign.imageUrl,
      imageAlt: campaign.imageAlt,
      vars,
    });
    return {
      subject: renderEmailTemplate(campaign.subject || "Hello", vars),
      body: bodies.text,
      htmlBody: bodies.html,
    };
  }
  return { body: renderSmsTemplate(campaign.message, vars) };
}

function clampLiveCap(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return LIVE_CAP_MAX;
  return Math.min(LIVE_CAP_MAX, Math.max(1, Math.floor(n)));
}

/**
 * Live provider call budget for one Launch / Autopilot batch.
 * - Explicit `override` wins (clamped to LIVE_CAP_MAX; 0 → max)
 * - Else SMS: `SMS_LIVE_CAP` or `TELNYX_LIVE_CAP`
 * - Else email: `EMAIL_LIVE_CAP`
 * - `0` / `unlimited` → LIVE_CAP_MAX (safety net, not truly unlimited)
 * - Else default 2000 (also min'd with batch size when provided)
 */
export function resolveLiveCap(
  channel: Campaign["channel"],
  override?: number,
  batchSize?: number,
): number {
  if (typeof override === "number" && Number.isFinite(override)) {
    return clampLiveCap(override);
  }
  const raw =
    channel === "sms"
      ? process.env.SMS_LIVE_CAP?.trim() ||
        process.env.TELNYX_LIVE_CAP?.trim()
      : process.env.EMAIL_LIVE_CAP?.trim();
  if (raw === "0" || raw?.toLowerCase() === "unlimited") {
    return LIVE_CAP_MAX;
  }
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return clampLiveCap(n);
  }
  const fallback = LIVE_CAP_DEFAULT;
  if (typeof batchSize === "number" && batchSize > 0) {
    return Math.min(fallback, batchSize, LIVE_CAP_MAX);
  }
  return fallback;
}

/**
 * Deliver one campaign batch through Telnyx (SMS) or cold-email provider.
 * Caps live API calls per batch (see resolveLiveCap / SMS_LIVE_CAP).
 * Contacts past the cap are skipped (not fake-delivered).
 */
export async function deliverCampaignBatch(input: {
  campaign: Campaign;
  brand: Brand;
  leads: Lead[];
  liveCap?: number;
  providerCampaignId?: string;
}): Promise<CampaignSendSummary> {
  const liveCap = resolveLiveCap(
    input.campaign.channel,
    input.liveCap,
    input.leads.length,
  );
  const results: ContactSendResult[] = [];
  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  let liveAttempts = 0;
  let sawLive = false;
  let sawMock = false;

  const fromNumber =
    input.brand.phoneNumbers[0] ||

    "";

  const providerReady =
    input.campaign.channel === "sms"
      ? isTelnyxConfigured()
      : isColdEmailConfigured();

  for (const lead of input.leads) {
    if (input.campaign.channel === "sms" && !hasSmsMarketingConsent(lead, input.brand.id)) {
      skipped += 1;
      results.push({ leadId: lead.id, status: "skipped", error: "SMS marketing permission is missing or withdrawn for this business and number" });
      continue;
    }
    // Double-check at send: never deliver to format-invalid email/phone.
    if (
      !contactOkForChannel(
        lead,
        input.campaign.channel,
        input.campaign.preferVerified ?? true,
      )
    ) {
      failed += 1;
      results.push({ leadId: lead.id, status: "failed", error: "Invalid contact" });
      continue;
    }

    if (providerReady && liveAttempts >= liveCap) {
      skipped += 1;
      results.push({ leadId: lead.id, status: "skipped", error: "Batch limit reached" });
      continue;
    }

    const copy = personalize(input.campaign, input.brand, lead);

    if (input.campaign.channel === "sms") {
      if (!lead.phone || !fromNumber) {
        failed += 1;
        results.push({ leadId: lead.id, status: "failed", error: "Company sender or recipient missing" });
        continue;
      }
      liveAttempts += 1;
      const result = await sendTelnyxSms({
        to: lead.phone,
        from: fromNumber,
        text: copy.body,
      });
      if (result.mode === "live") sawLive = true;
      else sawMock = true;
      results.push({ leadId: lead.id, status: result.mode === "mock" ? "mock" : result.uncertain ? "uncertain" : result.ok ? "accepted" : "failed", providerId: result.providerId, error: result.error });
      if (result.ok && result.mode === "live") delivered += 1;
      else failed += 1;
    } else {
      if (!lead.email) {
        failed += 1;
        results.push({ leadId: lead.id, status: "failed", error: "Company sender or recipient missing" });
        continue;
      }
      liveAttempts += 1;
      // Unpersonalized HTML for Smartlead sequence (keep {{firstName}} merge tags).
      const sequenceHtmlBodies = buildEmailBodies({
        message: input.campaign.message,
        htmlMessage: input.campaign.htmlMessage,
        imageUrl: input.campaign.imageUrl,
        imageAlt: input.campaign.imageAlt,
        vars: { firstName: "{{firstName}}", brand: "{{brand}}" },
      });
      const result = await sendColdEmail({
        to: lead.email,
        subject: copy.subject || "Hello",
        body: copy.body,
        htmlBody: copy.htmlBody,
        imageUrl: input.campaign.imageUrl || undefined,
        imageAlt: input.campaign.imageAlt || undefined,
        fromName: input.brand.shortName,
        firstName: lead.firstName,
        lastName: lead.lastName,
        brandId: input.brand.id,
        campaignId: input.campaign.id,
        providerCampaignId: input.providerCampaignId,
        brandName: input.brand.shortName,
        // Smartlead sequence is updated from CRM templates (merge tags),
        // so Launch copy stays owned by IG Lead Suite — not Smartlead UI.
        sequenceSubject: input.campaign.subject || "Hello",
        sequenceBody: input.campaign.message,
        sequenceHtml: sequenceHtmlBodies.html,
      });
      if (result.mode === "live") sawLive = true;
      else sawMock = true;
      results.push({ leadId: lead.id, status: result.mode === "mock" ? "mock" : result.uncertain ? "uncertain" : result.ok ? "accepted" : "failed", providerId: result.providerId, error: result.error });
      if (result.ok && result.mode === "live") delivered += 1;
      else failed += 1;
    }
  }

  return {
    results,
    attempted: input.leads.length,
    delivered,
    failed,
    skipped,
    liveCap,
    mode: sawLive && sawMock ? "mixed" : sawLive ? "live" : "mock",
    channel: input.campaign.channel,
    provider:
      input.campaign.channel === "sms"
        ? isTelnyxConfigured()
          ? "telnyx"
          : "telnyx-mock"
        : isColdEmailConfigured()
          ? emailProviderName()
          : "cold-email-mock",
  };
}
