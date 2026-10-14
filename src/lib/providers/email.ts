/**
 * Cold-email delivery via Instantly (preferred) or Smartlead.
 * Without API keys, sends are mocked.
 *
 * Instantly: adds the lead into a campaign (campaign sends on its schedule/warmup).
 * Docs: https://developer.instantly.ai/
 */

export type EmailSendResult = {
  ok: boolean;
  mode: "live" | "mock";
  provider: "instantly" | "smartlead" | "mock";
  providerId?: string;
  error?: string;
};

export function emailProviderName(): "instantly" | "smartlead" | "mock" {
  if (process.env.INSTANTLY_API_KEY?.trim()) return "instantly";
  if (process.env.SMARTLEAD_API_KEY?.trim()) return "smartlead";
  return "mock";
}

export function isColdEmailConfigured(): boolean {
  return emailProviderName() !== "mock";
}

export async function sendColdEmail(input: {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
  firstName?: string;
  lastName?: string;
  brandId?: string;
}): Promise<EmailSendResult> {
  const provider = emailProviderName();
  if (provider === "mock") {
    return {
      ok: true,
      mode: "mock",
      provider: "mock",
      providerId: `mock-email-${Date.now()}`,
    };
  }

  if (provider === "instantly") {
    return sendViaInstantly(input);
  }
  return sendViaSmartlead(input);
}

async function sendViaInstantly(input: {
  to: string;
  firstName?: string;
  lastName?: string;
  brandId?: string;
}): Promise<EmailSendResult> {
  const apiKey = process.env.INSTANTLY_API_KEY!.trim();
  const campaignId =
    (input.brandId &&
      process.env[`INSTANTLY_CAMPAIGN_${input.brandId.toUpperCase()}`]?.trim()) ||
    process.env.INSTANTLY_CAMPAIGN_ID?.trim();

  if (!campaignId) {
    return {
      ok: false,
      mode: "live",
      provider: "instantly",
      error:
        "Set INSTANTLY_CAMPAIGN_ID (or INSTANTLY_CAMPAIGN_<ENTITY>) for live email",
    };
  }

  try {
    const res = await fetch("https://api.instantly.ai/api/v2/leads", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        campaign: campaignId,
        email: input.to,
        first_name: input.firstName || undefined,
        last_name: input.lastName || undefined,
        skip_if_in_workspace: true,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        mode: "live",
        provider: "instantly",
        error: json.error || json.message || `Instantly HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      mode: "live",
      provider: "instantly",
      providerId: json.id,
    };
  } catch (err) {
    return {
      ok: false,
      mode: "live",
      provider: "instantly",
      error: err instanceof Error ? err.message : "Instantly request failed",
    };
  }
}

async function sendViaSmartlead(input: {
  to: string;
  firstName?: string;
  lastName?: string;
  brandId?: string;
}): Promise<EmailSendResult> {
  const apiKey = process.env.SMARTLEAD_API_KEY!.trim();
  const campaignId =
    (input.brandId &&
      process.env[`SMARTLEAD_CAMPAIGN_${input.brandId.toUpperCase()}`]?.trim()) ||
    process.env.SMARTLEAD_CAMPAIGN_ID?.trim();

  if (!campaignId) {
    return {
      ok: false,
      mode: "live",
      provider: "smartlead",
      error:
        "Set SMARTLEAD_CAMPAIGN_ID (or SMARTLEAD_CAMPAIGN_<ENTITY>) for live email",
    };
  }

  try {
    const url = `https://server.smartlead.ai/api/v1/campaigns/${campaignId}/leads?api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_list: [
          {
            email: input.to,
            first_name: input.firstName || "",
            last_name: input.lastName || "",
          },
        ],
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      upload_count?: number;
    };
    if (!res.ok) {
      return {
        ok: false,
        mode: "live",
        provider: "smartlead",
        error: json.message || `Smartlead HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      mode: "live",
      provider: "smartlead",
      providerId: `smartlead-${campaignId}-${Date.now()}`,
    };
  } catch (err) {
    return {
      ok: false,
      mode: "live",
      provider: "smartlead",
      error: err instanceof Error ? err.message : "Smartlead request failed",
    };
  }
}

export function renderEmailTemplate(
  template: string,
  vars: { firstName?: string; brand?: string },
): string {
  return template
    .replaceAll("{{firstName}}", vars.firstName || "there")
    .replaceAll("{{brand}}", vars.brand || "us");
}
