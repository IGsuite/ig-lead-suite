/**
 * Cold-email delivery via Smartlead (preferred here) or Instantly.
 * Without API keys, sends are mocked.
 *
 * Instantly wins if INSTANTLY_API_KEY is set; otherwise SMARTLEAD_API_KEY.
 * Both add the lead into a campaign (sends on that tool’s schedule/warmup).
 * Smartlead docs: https://api.smartlead.ai/
 * Instantly docs: https://developer.instantly.ai/
 *
 * HTML foundation: we pass personalized `htmlBody` + plain `body` (and optional
 * image URL) as lead custom fields so Smartlead/Instantly sequences can use
 * HTML. Configure the provider campaign sequence as HTML email (not plain-only).
 */

import {
  applyEmailTokens,
  buildEmailBodies,
  type EmailTemplateVars,
} from "@/lib/email-html";

export type EmailSendResult = {
  ok: boolean;
  mode: "live" | "mock";
  provider: "instantly" | "smartlead" | "mock";
  providerId?: string;
  error?: string;
};

export type ColdEmailInput = {
  to: string;
  subject: string;
  /** Plain-text body (fallback). */
  body: string;
  /** HTML body; when omitted, built from `body` + optional image. */
  htmlBody?: string;
  imageUrl?: string;
  imageAlt?: string;
  fromName?: string;
  firstName?: string;
  lastName?: string;
  brandId?: string;
};

export function emailProviderName(): "instantly" | "smartlead" | "mock" {
  if (process.env.INSTANTLY_API_KEY?.trim()) return "instantly";
  if (process.env.SMARTLEAD_API_KEY?.trim()) return "smartlead";
  return "mock";
}

export function isColdEmailConfigured(): boolean {
  return emailProviderName() !== "mock";
}

/** @deprecated Prefer applyEmailTokens / buildEmailBodies from email-html. */
export function renderEmailTemplate(
  template: string,
  vars: EmailTemplateVars,
): string {
  return applyEmailTokens(template, vars);
}

export { applyEmailTokens, buildEmailBodies };

export async function sendColdEmail(
  input: ColdEmailInput,
): Promise<EmailSendResult> {
  const vars: EmailTemplateVars = {
    firstName: input.firstName,
    brand: input.fromName,
  };
  const bodies =
    input.htmlBody?.trim()
      ? {
          text: input.body,
          html: input.htmlBody,
        }
      : buildEmailBodies({
          message: input.body,
          imageUrl: input.imageUrl,
          imageAlt: input.imageAlt,
          vars,
        });

  const payload = {
    ...input,
    body: bodies.text,
    htmlBody: bodies.html,
  };

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
    return sendViaInstantly(payload);
  }
  return sendViaSmartlead(payload);
}

function leadCustomFields(input: ColdEmailInput & { htmlBody: string }) {
  const fields: Record<string, string> = {
    email_text: input.body,
    email_html: input.htmlBody,
  };
  if (input.imageUrl?.trim()) {
    fields.image_url = input.imageUrl.trim();
  }
  if (input.imageAlt?.trim()) {
    fields.image_alt = input.imageAlt.trim();
  }
  return fields;
}

async function sendViaInstantly(
  input: ColdEmailInput & { htmlBody: string },
): Promise<EmailSendResult> {
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
    const custom = leadCustomFields(input);
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
        // Instantly custom variables — map {{email_html}} etc. in sequence HTML.
        custom_variables: custom,
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

async function sendViaSmartlead(
  input: ColdEmailInput & { htmlBody: string },
): Promise<EmailSendResult> {
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
    const custom = leadCustomFields(input);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_list: [
          {
            email: input.to,
            first_name: input.firstName || "",
            last_name: input.lastName || "",
            // Smartlead custom fields — use in HTML sequence as {{email_html}} / {{image_url}}.
            custom_fields: custom,
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
