/**
 * Cold-email delivery via Smartlead (preferred here) or Instantly.
 * Without API keys, sends are mocked.
 *
 * Instantly wins if INSTANTLY_API_KEY is set; otherwise SMARTLEAD_API_KEY.
 * Instantly adds the lead into a campaign (sequence owned in Instantly).
 * Smartlead: Launch pushes CRM subject/body onto the campaign sequence, then
 * adds the lead — IG Lead Suite is the source of truth for copy.
 * Smartlead docs: https://api.smartlead.ai/
 * Instantly docs: https://developer.instantly.ai/
 *
 * HTML foundation: personalized `htmlBody` + plain `body` (and optional
 * image URL) go as lead custom fields so sequences can use HTML.
 * Configure the provider campaign sequence as HTML email (not plain-only).
 */

import { isProductionDeploy } from "@/lib/auth";

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
  uncertain?: boolean;
};

export type ColdEmailInput = {
  to: string;
  subject: string;
  /** Plain-text body (fallback / personalized). */
  body: string;
  /** Personalized HTML body for lead custom fields. */
  htmlBody?: string;
  imageUrl?: string;
  imageAlt?: string;
  fromName?: string;
  firstName?: string;
  lastName?: string;
  brandId?: string;
  campaignId?: string;
  providerCampaignId?: string;
  /** CRM brand short name — substituted for {{brand}} in Smartlead templates. */
  brandName?: string;
  /**
   * Unpersonalized CRM templates (may include {{firstName}} / {{brand}}).
   * Smartlead sequence is updated from these so merge tags work per lead.
   */
  sequenceSubject?: string;
  sequenceBody?: string;
  /** Unpersonalized HTML for Smartlead sequence email_body (merge tags intact). */
  sequenceHtml?: string;
};

/** Avoid re-pausing / rewriting the same sequence for every lead in a batch. */
const smartleadSequenceSyncCache = new Map<string, string>();

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
    brand: input.fromName || input.brandName,
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

  const payload: ColdEmailInput & { htmlBody: string } = {
    ...input,
    body: bodies.text,
    htmlBody: bodies.html,
  };

  const provider = emailProviderName();
  if (provider === "mock") {
    return {
      ok: !isProductionDeploy(),
      error: isProductionDeploy() ? "Email provider is not configured" : undefined,
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
    email_subject: input.subject,
    email_text: input.body,
    email_body: input.body,
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
  const campaignId = input.providerCampaignId || resolveCompanyCampaign("INSTANTLY", input.brandId, input.campaignId);

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
      signal: AbortSignal.timeout(15000),
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
    if (!res.ok || !json.id) {
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
      error: "Instantly request outcome unknown",
      uncertain: true,
    };
  }
}

function smartleadApiKey(): string {
  return process.env.SMARTLEAD_API_KEY!.trim();
}

export function resolveCompanyCampaign(provider: "SMARTLEAD" | "INSTANTLY", brandId?: string, crmCampaignId?: string): string | undefined {
  const prefix = brandId && `${provider}_CAMPAIGN_${brandId.toUpperCase()}`;
  const scopedKey = prefix && crmCampaignId && `${prefix}__${crmCampaignId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
  const id = (scopedKey && process.env[scopedKey]?.trim()) || (prefix && process.env[prefix]?.trim());
  if (!id) return undefined;
  const mappings = Object.entries(process.env).filter(([key, value]) =>
    key.startsWith(`${provider}_CAMPAIGN_`) && key !== `${provider}_CAMPAIGN_ID` && value?.trim() === id);
  if (mappings.length !== 1) throw new Error(`${provider}: each company must have a distinct campaign ID`);
  return id;
}

function resolveSmartleadCampaignId(brandId?: string, campaignId?: string) {
  return resolveCompanyCampaign("SMARTLEAD", brandId, campaignId);
}

function smartleadUrl(path: string): string {
  const key = encodeURIComponent(smartleadApiKey());
  return `https://server.smartlead.ai/api/v1${path}?api_key=${key}`;
}

/** Convert CRM merge tags to Smartlead's, and bake in brand name. */
export function toSmartleadTemplate(
  template: string,
  brandName?: string,
): string {
  return template
    .replaceAll("{{firstName}}", "{{first_name}}")
    .replaceAll("{{lastName}}", "{{last_name}}")
    .replaceAll("{{brand}}", brandName || "us");
}

/** Plain text → minimal HTML for Smartlead email_body; leave existing HTML alone. */
export function toSmartleadEmailHtml(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "<p></p>";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  const escaped = trimmed
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replaceAll("\n", "<br>")}</p>`)
    .join("");
}

type SmartleadSequenceRow = {
  id?: number | null;
  seq_number?: number;
  subject?: string;
  email_body?: string;
  seq_delay_details?: { delay_in_days?: number };
  variants?: Array<{
    subject?: string;
    email_body?: string;
    variant_label?: string;
  }>;
};

async function smartleadJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: T; error?: string }> {
  try {
    const res = await fetch(smartleadUrl(path), {
      ...init,
    signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const json = (await res.json().catch(() => ({}))) as T & {
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        json,
        error:
          json.message ||
          json.error ||
          `Smartlead HTTP ${res.status}`,
      };
    }
    return { ok: true, status: res.status, json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      json: {} as T,
      error: "Smartlead request outcome unknown",
    };
  }
}

async function getSmartleadCampaignStatus(
  campaignId: string,
): Promise<string | undefined> {
  const result = await smartleadJson<{
    status?: string;
    campaign?: { status?: string };
  }>(`/campaigns/${campaignId}`);
  if (!result.ok) return undefined;
  return result.json.status || result.json.campaign?.status;
}

async function setSmartleadCampaignStatus(
  campaignId: string,
  status: "START" | "PAUSED" | "STOPPED",
): Promise<{ ok: boolean; error?: string }> {
  const result = await smartleadJson(`/campaigns/${campaignId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

async function fetchSmartleadSequences(
  campaignId: string,
): Promise<SmartleadSequenceRow[]> {
  const result = await smartleadJson<
    | SmartleadSequenceRow[]
    | { data?: SmartleadSequenceRow[]; sequences?: SmartleadSequenceRow[] }
  >(`/campaigns/${campaignId}/sequences`);
  if (!result.ok) return [];
  const json = result.json;
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.sequences)) return json.sequences;
  return [];
}

/**
 * Pause if needed, write CRM subject/body as sequence #1, then START.
 * Cached per process so a Launch batch only syncs once for the same copy.
 */
export async function syncSmartleadSequenceCopy(input: {
  campaignId: string;
  subject: string;
  body: string;
  htmlBody?: string;
  brandName?: string;
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const subject = toSmartleadTemplate(input.subject, input.brandName);
  const rawBody = input.htmlBody?.trim()
    ? toSmartleadTemplate(input.htmlBody, input.brandName)
    : toSmartleadTemplate(input.body, input.brandName);
  const emailBody = toSmartleadEmailHtml(rawBody);
  const fingerprint = `${subject}\n---\n${emailBody}`;
  const cacheKey = input.campaignId;
  if (smartleadSequenceSyncCache.get(cacheKey) === fingerprint) {
    return { ok: true, skipped: true };
  }

  const currentStatus = await getSmartleadCampaignStatus(input.campaignId);
  const wasActive = (currentStatus || "").toUpperCase() === "ACTIVE";

  if (wasActive) {
    const paused = await setSmartleadCampaignStatus(input.campaignId, "PAUSED");
    if (!paused.ok) {
      return {
        ok: false,
        error:
          paused.error ||
          "Could not pause Smartlead campaign to update copy",
      };
    }
  }

  const existing = await fetchSmartleadSequences(input.campaignId);
  const first =
    existing.find((s) => s.seq_number === 1) || existing[0] || null;

  const sequencePayload = {
    sequences: [
      {
        id: first?.id ?? null,
        seq_number: 1,
        subject,
        email_body: emailBody,
        seq_delay_details: {
          delay_in_days: first?.seq_delay_details?.delay_in_days ?? 0,
        },
      },
    ],
  };

  const save = await smartleadJson(`/campaigns/${input.campaignId}/sequences`, {
    method: "POST",
      signal: AbortSignal.timeout(15000),
    body: JSON.stringify(sequencePayload),
  });

  if (!save.ok) {
    // Helpful fallback: some accounts expect the variants-shaped body.
    const variantPayload = [
      {
        id: first?.id ?? null,
        seq_number: 1,
        seq_delay_details: {
          delay_in_days: first?.seq_delay_details?.delay_in_days ?? 0,
        },
        variant_distribution_type: "MANUALLY_EQUAL",
        variants: [
          {
            subject,
            email_body: emailBody,
            variant_label: "A",
          },
        ],
      },
    ];
    const saveVariants = await smartleadJson(
      `/campaigns/${input.campaignId}/sequences`,
      {
        method: "POST",
      signal: AbortSignal.timeout(15000),
        body: JSON.stringify(variantPayload),
      },
    );
    if (!saveVariants.ok) {
      if (wasActive) {
        await setSmartleadCampaignStatus(input.campaignId, "START");
      }
      return {
        ok: false,
        error:
          saveVariants.error ||
          save.error ||
          "Could not update Smartlead sequence",
      };
    }
  }

  const started = await setSmartleadCampaignStatus(input.campaignId, "START");
  if (!started.ok) {
    return {
      ok: false,
      error:
        started.error ||
        "CRM copy saved on Smartlead sequence, but campaign could not be set Active — start it in Smartlead (mailbox must stay connected)",
    };
  }

  smartleadSequenceSyncCache.set(cacheKey, fingerprint);
  return { ok: true };
}

/** Test helper — clear in-process sequence sync cache. */
export function clearSmartleadSequenceSyncCache(): void {
  smartleadSequenceSyncCache.clear();
}

async function sendViaSmartlead(
  input: ColdEmailInput & { htmlBody: string },
): Promise<EmailSendResult> {
  const campaignId = input.providerCampaignId || resolveSmartleadCampaignId(input.brandId, input.campaignId);

  if (!campaignId) {
    return {
      ok: false,
      mode: "live",
      provider: "smartlead",
      error:
        "Set SMARTLEAD_CAMPAIGN_ID (or SMARTLEAD_CAMPAIGN_<ENTITY>) for live email",
    };
  }

  const seqSubject = input.sequenceSubject || input.subject;
  const seqBody = input.sequenceBody || input.body;
  const seqHtml = input.sequenceHtml || input.htmlBody;

  const synced = await syncSmartleadSequenceCopy({
    campaignId,
    subject: seqSubject,
    body: seqBody,
    htmlBody: seqHtml,
    brandName: input.brandName,
  });
  if (!synced.ok) {
    return {
      ok: false,
      mode: "live",
      provider: "smartlead",
      error: synced.error || "Failed to sync CRM copy to Smartlead sequence",
    };
  }

  try {
    const url = smartleadUrl(`/campaigns/${campaignId}/leads`);
    const custom = leadCustomFields(input);
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_list: [
          {
            email: input.to,
            first_name: input.firstName || "",
            last_name: input.lastName || "",
            // Backup custom fields + HTML/image for stub sequences.
            custom_fields: custom,
          },
        ],
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      upload_count?: number;
      added_count?: number;
    };
    if (!res.ok || json.ok === false || Number(json.added_count ?? json.upload_count ?? 0) < 1) {
      return {
        ok: false,
        mode: "live",
        provider: "smartlead",
        error: json.message || "Smartlead did not accept this contact",
      };
    }
    return {
      ok: true,
      mode: "live",
      provider: "smartlead",
      providerId: `smartlead:${campaignId}:${input.to.toLowerCase()}`,
    };
  } catch (err) {
    return {
      ok: false,
      mode: "live",
      provider: "smartlead",
      error: "Smartlead request outcome unknown",
      uncertain: true,
    };
  }
}
