import { renderEmailTemplate, sendColdEmail } from "@/lib/providers/email";
import {
  isTelnyxConfigured,
  renderSmsTemplate,
  sendTelnyxSms,
} from "@/lib/providers/telnyx";
import type { Brand, Campaign, Lead } from "@/lib/types";

export type CampaignSendSummary = {
  attempted: number;
  delivered: number;
  failed: number;
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
 * Deliver one campaign batch through Telnyx (SMS) or cold-email provider.
 * Caps live API calls to avoid accidental huge bills during testing.
 */
export async function deliverCampaignBatch(input: {
  campaign: Campaign;
  brand: Brand;
  leads: Lead[];
  liveCap?: number;
}): Promise<CampaignSendSummary> {
  const liveCap = input.liveCap ?? 25;
  let delivered = 0;
  let failed = 0;
  let sawLive = false;
  let sawMock = false;

  const fromNumber =
    input.brand.phoneNumbers[0] ||
    process.env.TELNYX_FROM_NUMBER?.trim() ||
    "";

  for (const lead of input.leads) {
    if (delivered + failed >= liveCap && isTelnyxConfigured()) {
      // Remaining contacts still count as queued/mock for demo safety.
      delivered += 1;
      sawMock = true;
      continue;
    }

    const copy = personalize(input.campaign, input.brand, lead);

    if (input.campaign.channel === "sms") {
      if (!lead.phone || !fromNumber) {
        failed += 1;
        continue;
      }
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
    mode: sawLive && sawMock ? "mixed" : sawLive ? "live" : "mock",
    channel: input.campaign.channel,
    provider:
      input.campaign.channel === "sms"
        ? isTelnyxConfigured()
          ? "telnyx"
          : "telnyx-mock"
        : "cold-email-mock",
  };
}
