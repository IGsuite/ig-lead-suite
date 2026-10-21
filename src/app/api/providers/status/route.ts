import { sendingEntityEnabled, sendingChannelEnabled } from "@/lib/dispatch-scheduler";
import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import {
  emailProviderName,
  isColdEmailConfigured,
  resolveCompanyCampaign,
} from "@/lib/providers/email";
import { isTelnyxConfigured } from "@/lib/providers/telnyx";
import { LIVE_CAP_DEFAULT, LIVE_CAP_MAX, resolveLiveCap } from "@/lib/send";
import { isNeonConfigured, getData } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { canAccessEntity } from "@/lib/acl";
import { createHash } from "node:crypto";

function hasAnyCampaign(
  prefix: "INSTANTLY" | "SMARTLEAD",
): boolean {
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
  const session = await getSession();
  const brands = (await getData()).brands;
  const normalize = (number: string) => number.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const companyReadiness = brands.filter(brand => canAccessEntity(session, brand.id)).map(brand => {
    let emailCampaignConfigured = false;
    try { emailCampaignConfigured = email !== "mock" && Boolean(resolveCompanyCampaign(email === "smartlead" ? "SMARTLEAD" : "INSTANTLY", brand.id)); } catch { /* duplicate provider mappings are not ready */ }
    const number = brand.phoneNumbers[0];
    const uniqueSmsNumber = Boolean(number) && !brands.some(other => other.id !== brand.id && other.phoneNumbers.some(otherNumber => normalize(otherNumber) === normalize(number)));
    return { entityId: brand.id, sendingEnabled: sendingEntityEnabled(brand.id), emailCampaignConfigured, uniqueSmsNumber };
  });
  const publicAppUrl = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "") || null;
  let databaseScopeId: string | null = null;
  try {
    const dbUrl = new URL(process.env.DATABASE_URL || "");
    databaseScopeId = createHash("sha256").update(dbUrl.hostname.replace("-pooler.", ".") + dbUrl.pathname).digest("hex").slice(0, 16);
  } catch { /* Local JSON storage has no database scope. */ }
  return NextResponse.json({
    databaseScopeId,
    neon: isNeonConfigured() ? "live" : "local",
    telnyx: isTelnyxConfigured() ? "live" : "mock",
    email,
    emailLive: isColdEmailConfigured(),
    companyReadiness,
    dispatchEnabled: process.env.SENDING_ENABLED === "true" && (process.env.VERCEL !== "1" || process.env.VERCEL_ENV === "production"),
    sendingChannels: { email: sendingChannelEnabled("email"), sms: sendingChannelEnabled("sms") },
    acceptanceIsNotDelivery: true,
    publicAppUrl,
    webhooks: publicAppUrl
      ? {
          telnyx: `${publicAppUrl}/api/webhooks/telnyx`,
          email: `${publicAppUrl}/api/webhooks/email`,
        }
      : null,
    hasSmartleadCampaign: hasAnyCampaign("SMARTLEAD"),
    hasInstantlyCampaign: hasAnyCampaign("INSTANTLY"),
    hasTelnyxFrom: companyReadiness.some(company => company.uniqueSmsNumber),
    /** Max live Telnyx SMS API calls per Launch batch (safety net). */
    smsLiveCap: resolveLiveCap("sms"),
    emailLiveCap: resolveLiveCap("email"),
    liveCapDefault: LIVE_CAP_DEFAULT,
    liveCapMax: LIVE_CAP_MAX,
    checklist: {
      neon: isNeonConfigured(),
      telnyxKey: isTelnyxConfigured(),
      telnyxFrom: companyReadiness.some(company => company.uniqueSmsNumber),
      coldEmailKey: isColdEmailConfigured(),
      coldEmailCampaign: companyReadiness.some(company => company.sendingEnabled) && companyReadiness.filter(company => company.sendingEnabled).every(company => company.emailCampaignConfigured),
      telnyxWebhookKey: Boolean(process.env.TELNYX_PUBLIC_KEY?.trim()),
      emailWebhookCredential: Boolean(process.env.EMAIL_WEBHOOK_SECRET?.trim()),
      schedulerCredential: Boolean(process.env.CRON_SECRET?.trim()),
      publicUrl: Boolean(publicAppUrl),
    },
  });
}
