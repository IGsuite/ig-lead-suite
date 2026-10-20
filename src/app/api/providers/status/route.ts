import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import {
  emailProviderName,
  isColdEmailConfigured,
} from "@/lib/providers/email";
import { isTelnyxConfigured } from "@/lib/providers/telnyx";
import { LIVE_CAP_DEFAULT, LIVE_CAP_MAX, resolveLiveCap } from "@/lib/send";
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
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
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
    /** Max live Telnyx SMS API calls per Launch batch (safety net). */
    smsLiveCap: resolveLiveCap("sms"),
    emailLiveCap: resolveLiveCap("email"),
    liveCapDefault: LIVE_CAP_DEFAULT,
    liveCapMax: LIVE_CAP_MAX,
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
