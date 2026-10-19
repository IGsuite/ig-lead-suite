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

export type CampaignSendSummary = {
  attempted: number;
  delivered: number;
  failed: number;
  skipped: number;
  liveCap: number;
  mode: "live" | "mock" | "mixed";
  channel: Campaign["channel"];
  provider: string;
};

function personalize(
  campaign: Campaign,
  brand: Brand,
  lead: Lead,
): { subject?: string; body: string } {
  const vars = { firstName: lead.firstName, brand: brand.shortName };
  if (campaign.channel === "email") {
    return {
      subject: renderEmailTemplate(campaign.subject || "Hello", vars),
      body: renderEmailTemplate(campaign.message, vars),
    };
  }
  return { body: renderSmsTemplate(campaign.message, vars) };
}

/**
 * Live provider call budget for one Launch / Autopilot batch.
 * - Explicit `override` wins
 * - Else SMS_LIVE_CAP / EMAIL_LIVE_CAP env (0 or "unlimited" = no cap)
 * - Else defaults: SMS 2000, email 2000 (was 25 for early testing)
 */
export function resolveLiveCap(
  channel: Campaign["channel"],
  override?: number,
  batchSize?: number,
): number {
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return override === 0 ? Number.POSITIVE_INFINITY : override;
  }
  const raw =
    channel === "sms"
      ? process.env.SMS_LIVE_CAP?.trim()
      : process.env.EMAIL_LIVE_CAP?.trim();
  if (raw === "0" || raw?.toLowerCase() === "unlimited") {
    return Number.POSITIVE_INFINITY;
  }
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) {
      return n === 0 ? Number.POSITIVE_INFINITY : n;
    }
  }
  const fallback = 2000;
  if (typeof batchSize === "number" && batchSize > 0) {
    return Math.min(fallback, batchSize);
  }
  return fallback;
}

/**
 * Deliver one campaign batch through Telnyx (SMS) or cold-email provider.
 * Caps live API calls per batch (see resolveLiveCap / SMS_LIVE_CAP).
 */
export async function deliverCampaignBatch(input: {
  campaign: Campaign;
  brand: Brand;
  leads: Lead[];
  liveCap?: number;
}): Promise<CampaignSendSummary> {
  const liveCap = resolveLiveCap(
    input.campaign.channel,
    input.liveCap,
    input.leads.length,
  );
  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  let liveAttempts = 0;
  let sawLive = false;
  let sawMock = false;

  const fromNumber =
    input.brand.phoneNumbers[0] ||
    process.env.TELNYX_FROM_NUMBER?.trim() ||
    "";

  const providerReady =
    input.campaign.channel === "sms"
      ? isTelnyxConfigured()
      : isColdEmailConfigured();

  for (const lead of input.leads) {
    // Double-check at send: never deliver to format-invalid email/phone.
    if (
      !contactOkForChannel(
        lead,
        input.campaign.channel,
        input.campaign.preferVerified ?? true,
      )
    ) {
      failed += 1;
      continue;
    }

    if (providerReady && liveAttempts >= liveCap) {
      // Past the live budget — do not fake-deliver.
      skipped += 1;
      continue;
    }

    const copy = personalize(input.campaign, input.brand, lead);

    if (input.campaign.channel === "sms") {
      if (!lead.phone || !fromNumber) {
        failed += 1;
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
      if (result.ok) delivered += 1;
      else failed += 1;
    } else {
      if (!lead.email) {
        failed += 1;
        continue;
      }
      liveAttempts += 1;
      const result = await sendColdEmail({
        to: lead.email,
        subject: copy.subject || "Hello",
        body: copy.body,
        fromName: input.brand.shortName,
        firstName: lead.firstName,
        lastName: lead.lastName,
        brandId: input.brand.id,
      });
      if (result.mode === "live") sawLive = true;
      else sawMock = true;
      if (result.ok) delivered += 1;
      else failed += 1;
    }
  }

  return {
    attempted: input.leads.length,
    delivered,
    failed,
    skipped,
    liveCap: Number.isFinite(liveCap) ? liveCap : input.leads.length,
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
