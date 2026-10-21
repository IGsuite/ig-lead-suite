import { getPrisma } from "@/lib/db";
import { assertCampaignSendingReady } from "@/lib/dispatch-scheduler";
import { mailboxMatchesBrand } from "@/lib/reply-routing";
import { messageFingerprint } from "@/lib/rotation-select";
import { resolveWindowHours } from "@/lib/send-window";
import { resolveCompanyCampaign, toSmartleadTemplate, toSmartleadEmailHtml } from "@/lib/providers/email";
import type { Brand, Campaign } from "@/lib/types";

type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === "object" ? value as Row : {};
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value : Array.isArray(object(value).data) ? object(value).data as unknown[] : []).map(object);
class SetupError extends Error {
  constructor(message: string, public uncertain = false) { super(message); }
}
async function request(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const key = process.env.SMARTLEAD_API_KEY?.trim();
  if (!key) throw new SetupError("The email service is not configured.");
  let response: Response;
  try {
    response = await fetch(`https://server.smartlead.ai/api/v1${path}?api_key=${encodeURIComponent(key)}`, {
      method, cache: "no-store", headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new SetupError("The email service did not confirm campaign setup. Check its status before retrying.", true); }
  if (!response.ok) throw new SetupError(`Email campaign setup was rejected (${response.status}) at ${path}.`, response.status >= 500);
  const raw = await response.text();
  if (!raw.trim()) return {};
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new SetupError("The email service returned an unrecognized setup confirmation.", true); }
  const result = object(value);
  if (result.ok === false || result.success === false || result.error || result.errors) throw new SetupError("The email service could not configure this campaign.");
  return value;
}

/** Called only for an explicitly launched campaign with eligible recipients. No leads or START requests here. */
export function emailCampaignFingerprint(campaign: Campaign, brand: Brand): string {
  return messageFingerprint("email", JSON.stringify([campaign.message, campaign.htmlMessage, campaign.imageUrl,
    campaign.subject, brand.shortName, campaign.sendWindowPreset, campaign.sendWindowStart, campaign.sendWindowEnd, campaign.timezone,
    campaign.volume,campaign.throttlePerHour]));
}
export async function ensureEmailCampaign(campaign: Campaign, brand: Brand): Promise<string> {
  if (campaign.brandId !== brand.id) throw new Error("Campaign does not belong to this business.");
  assertCampaignSendingReady(brand.id, "email");
  const db = getPrisma();
  const fingerprint = emailCampaignFingerprint(campaign, brand);
  let existing = await db.emailCampaignSetup.findUnique({ where: { campaignId: campaign.id } });
  if (existing && (existing.brandId !== brand.id || existing.fingerprint !== fingerprint))
    throw new Error("This campaign already has a different saved message or schedule. Create a new draft for the changed campaign.");
  if (existing?.state === "ready" && existing.providerCampaignId) return existing.providerCampaignId;
  if (existing?.state === "uncertain") throw new Error("Campaign setup needs reconciliation before another launch. No contacts have been queued.");

  const templateId = resolveCompanyCampaign("SMARTLEAD", brand.id, campaign.id);
  if (!templateId) throw new Error("Connect a verified sending mailbox for this business before launching.");
  const origin = process.env.PUBLIC_APP_URL?.replace(/\/$/, ""), secret = process.env.EMAIL_WEBHOOK_SECRET?.trim();
  if (!origin || new URL(origin).protocol !== "https:" || !secret || secret.length < 32) throw new Error("Email reply callbacks are not configured.");
  const accounts = rows(await request(`/campaigns/${encodeURIComponent(templateId)}/email-accounts`));
  if (!accounts.length || accounts.some(a => !mailboxMatchesBrand(String(a.from_email || a.email || ""), brand)
    || a.is_smtp_success !== true || a.is_imap_success !== true || !Number.isInteger(Number(a.id))))
    throw new Error("This business needs its own verified sending and receiving mailbox.");
  const template = object(await request(`/campaigns/${encodeURIComponent(templateId)}`));
  const target = new URL("/api/webhooks/email", origin); target.searchParams.set("token", secret);

  const reserved = await db.emailCampaignSetup.createMany({ data: [{ campaignId: campaign.id, brandId: brand.id, fingerprint, state: "preparing" }], skipDuplicates: true });
  if (!reserved.count) {
    existing = await db.emailCampaignSetup.findUniqueOrThrow({ where: { campaignId: campaign.id } });
    if (existing.brandId !== brand.id || existing.fingerprint !== fingerprint) throw new Error("This campaign changed during preparation. Review its saved settings.");
    if (existing.state === "ready" && existing.providerCampaignId) return existing.providerCampaignId;
    const claim = await db.emailCampaignSetup.updateMany({ where: { campaignId: campaign.id, fingerprint, brandId: brand.id,
      OR: [{ state: "failed" }, { state: "preparing", providerCampaignId: { not: null }, updatedAt: { lt: new Date(Date.now() - 600_000) } }] },
      data: { state: "preparing", error: null } });
    if (!claim.count) throw new Error("This campaign is already being prepared or needs reconciliation. No contacts have been queued.");
  }
  let providerId = existing?.providerCampaignId;
  let creating = !providerId;
  try {
    if (!providerId) {
      const created = object(await request("/campaigns/create", "POST", { name: `IG ${brand.shortName} · ${campaign.id} · ${campaign.name}`.slice(0, 200),
        ...(template.client_id ? { client_id: template.client_id } : {}) }));
      const id = created.id || object(created.data).id;
      if (!/^\d+$/.test(String(id || ""))) throw new SetupError("The email service did not return the new campaign ID. Reconciliation is required.", true);
      providerId = String(id);
      // Persist immediately: a later configuration failure must reuse this empty campaign, never create another.
      await db.emailCampaignSetup.update({ where: { campaignId: campaign.id }, data: { providerCampaignId: providerId } });
      creating = false;
    }
    const prefix = `/campaigns/${encodeURIComponent(providerId)}`;
    await request(`${prefix}/status`, "POST", { status: "PAUSED" });
    await request(`${prefix}/email-accounts`, "POST", { email_account_ids: accounts.map(a => Number(a.id)) });
    const window = resolveWindowHours(campaign) || { start: "00:00", end: "23:59" };
    const accountLimit = accounts.reduce((sum, a) => sum + Math.max(1, Number(a.message_per_day || a.max_email_per_day) || 15), 0);
    const scheduler = object(template.scheduler_cron_value);
    const datedRun = campaign.id.startsWith("camp-calendar-") ? await db.marketingCalendarEntry.findUnique({where:{runCampaignId:campaign.id}}) : null;
    await request(`${prefix}/schedule`, "POST", { timezone: campaign.timezone || "America/New_York",
      days_of_the_week: datedRun ? [new Date(datedRun.date+"T12:00:00Z").getUTCDay()] : Array.isArray(scheduler.days) && scheduler.days.length ? scheduler.days : [0, 1, 2, 3, 4, 5, 6],
      // The CRM outbox enforces the exact hourly throttle. Do not inherit an old template's slower interval/cap.
      start_hour: window.start, end_hour: window.end, min_time_btw_emails: Math.max(1, Math.floor(60 / Math.max(1, campaign.throttlePerHour))),
      max_new_leads_per_day: Math.min(accountLimit,campaign.volume) });
    await request(`${prefix}/settings`, "POST", { stop_lead_settings: "REPLY_TO_AN_EMAIL", track_settings: template.track_settings || [] });
    const subject = toSmartleadTemplate(campaign.subject || "", brand.shortName);
    const emailBody = toSmartleadEmailHtml(toSmartleadTemplate(campaign.htmlMessage?.trim() || campaign.message, brand.shortName));
    const savedSequences = rows(await request(`${prefix}/sequences`));
    const firstSequence = savedSequences.find(sequence => sequence.seq_number === 1) || savedSequences[0];
    await request(`${prefix}/sequences`, "POST", { sequences: [{ id: firstSequence?.id ?? null, seq_number: 1,
      seq_delay_details: { delay_in_days: 0 }, subject, email_body: emailBody }] });
    const hooks = rows(await request(`${prefix}/webhooks`));
    for (const event of ["EMAIL_REPLY", "UNTRACKED_REPLIES", "EMAIL_SENT", "EMAIL_BOUNCE", "LEAD_UNSUBSCRIBED"]) {
      const matches = hooks.filter(h => h.name === `IG CRM ${event}`);
      if (matches.length > 1) throw new SetupError("Duplicate email callbacks require review.");
      await request(`${prefix}/webhooks`, "POST", { id: matches[0]?.id || null, name: `IG CRM ${event}`, webhook_url: target.toString(), event_types: [event] });
    }
    await db.emailCampaignSetup.update({ where: { campaignId: campaign.id }, data: { state: "ready", error: null } });
    return providerId;
  } catch (error) {
    // An ambiguous create is never retried: it may already have created a provider campaign.
    const uncertain = creating && (!(error instanceof SetupError) || error.uncertain);
    await db.emailCampaignSetup.update({ where: { campaignId: campaign.id }, data: { state: uncertain ? "uncertain" : "failed",
      error: error instanceof SetupError ? error.message : "Campaign setup could not be confirmed." } }).catch(() => undefined);
    throw new Error(uncertain ? "Campaign setup needs reconciliation before retrying. No contacts have been queued."
      : "Email campaign setup is incomplete. Your draft is saved and no contacts have been queued.");
  }
}
