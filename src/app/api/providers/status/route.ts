import { NextResponse } from "next/server";
import {
  emailProviderName,
  isColdEmailConfigured,
} from "@/lib/providers/email";
import { isTelnyxConfigured } from "@/lib/providers/telnyx";
import { isNeonConfigured } from "@/lib/store";

export async function GET() {
  const email = emailProviderName();
  return NextResponse.json({
    neon: isNeonConfigured() ? "live" : "local",
    telnyx: isTelnyxConfigured() ? "live" : "mock",
    email,
    emailLive: isColdEmailConfigured(),
    hasInstantlyCampaign: Boolean(
      process.env.INSTANTLY_CAMPAIGN_ID?.trim() ||
        process.env.INSTANTLY_CAMPAIGN_ABSTRACT?.trim(),
    ),
    hasTelnyxFrom: Boolean(process.env.TELNYX_FROM_NUMBER?.trim()),
    checklist: {
      neon: isNeonConfigured(),
      telnyxKey: isTelnyxConfigured(),
      telnyxFrom: Boolean(process.env.TELNYX_FROM_NUMBER?.trim()),
      coldEmailKey: isColdEmailConfigured(),
      coldEmailCampaign: Boolean(
        process.env.INSTANTLY_CAMPAIGN_ID?.trim() ||
          process.env.SMARTLEAD_CAMPAIGN_ID?.trim(),
      ),
    },
  });
}
