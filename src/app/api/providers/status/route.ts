import { NextResponse } from "next/server";
import {
  emailProviderName,
  isColdEmailConfigured,
} from "@/lib/providers/email";
import { isTelnyxConfigured } from "@/lib/providers/telnyx";
import { isNeonConfigured } from "@/lib/store";

function hasAnyCampaign(
  prefix: "INSTANTLY" | "SMARTLEAD",
): boolean {
  if (process.env[`${prefix}_CAMPAIGN_ID`]?.trim()) return true;
  for (const entity of [
    "ABSTRACT",
    "AHAVA",
    "TAKEMORE",
    "VENTURE",
    "TYH",
  ]) {
    if (process.env[`${prefix}_CAMPAIGN_${entity}`]?.trim()) return true;
  }
  return false;
}

export async function GET() {
  const email = emailProviderName();
  const publicAppUrl = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "") || null;
  return NextResponse.json({
    neon: isNeonConfigured() ? "live" : "local",
    telnyx: isTelnyxConfigured() ? "live" : "mock",
    email,
    emailLive: isColdEmailConfigured(),
    publicAppUrl,
    webhooks: publicAppUrl
      ? {
          telnyx: `${publicAppUrl}/api/webhooks/telnyx`,
          email: `${publicAppUrl}/api/webhooks/email`,
        }
      : null,
    hasSmartleadCampaign: hasAnyCampaign("SMARTLEAD"),
    hasInstantlyCampaign: hasAnyCampaign("INSTANTLY"),
    hasTelnyxFrom: Boolean(process.env.TELNYX_FROM_NUMBER?.trim()),
    checklist: {
      neon: isNeonConfigured(),
      telnyxKey: isTelnyxConfigured(),
      telnyxFrom: Boolean(process.env.TELNYX_FROM_NUMBER?.trim()),
      coldEmailKey: isColdEmailConfigured(),
      coldEmailCampaign: hasAnyCampaign("SMARTLEAD") || hasAnyCampaign("INSTANTLY"),
      publicUrl: Boolean(publicAppUrl),
    },
  });
}
