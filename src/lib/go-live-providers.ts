import { mailboxBelongsToCompany, smsRegistrationState, uniqueCompanyNumber, type ReadinessCheck, type NumberAssignment } from "@/lib/go-live";
import { emailProviderName, resolveCompanyCampaign } from "@/lib/providers/email";
import { sendingEnabled, sendingEntityEnabled, sendingChannelEnabled } from "@/lib/dispatch-scheduler";
import { inboxSendingDisabledReason } from "@/lib/inbox-service";
import type { Brand, Reply } from "@/lib/types";

type JsonRow = Record<string, unknown>;
async function read(url: string, key?: string): Promise<JsonRow> {
  const response = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : undefined, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(response.status === 404 ? "not_found" : "provider_unavailable");
  return response.json();
}
function gate(brand: Brand, channel: "email" | "sms"): ReadinessCheck {
  const enabled = sendingEnabled() && sendingEntityEnabled(brand.id) && sendingChannelEnabled(channel);
  return { id: `${channel}-switch`, title: `${channel === "sms" ? "Text" : "Email"} campaign sending`, state: enabled ? "active" : "inactive", detail: enabled ? "Enabled for this company. Campaigns still require your Launch or an approved calendar date." : "Sending is switched off for this company or channel. Saved campaigns do not activate this switch." };
}
function replyGate(brand: Brand, channel: "email" | "sms"): ReadinessCheck {
  const disabled = inboxSendingDisabledReason({ brandId: brand.id, channel, from: "" } as Reply);
  return { id: `${channel}-replies`, title: `${channel === "sms" ? "Text" : "Email"} inbox replies`, state: disabled ? "inactive" : "active", detail: disabled || "Reply controls are enabled. Each conversation still requires a valid receiving identity and no opt-out.", href: `/inbox?entity=${encodeURIComponent(brand.id)}&channel=${channel}`, linkLabel: "Open inbox" };
}

export async function companySmsReadiness(brand: Brand, allBrands: Brand[]): Promise<ReadinessCheck[]> {
  const number = brand.phoneNumbers[0];
  const checks: ReadinessCheck[] = [gate(brand, "sms"), replyGate(brand, "sms")];
  const key = process.env.TELNYX_API_KEY?.trim();
  const sender: ReadinessCheck = { id: "sms-sender", title: "Texting number & carrier registration", state: "not_connected", detail: "Add this company's own texting number, then assign it to its approved registration.", href: `/company-setup?entity=${encodeURIComponent(brand.id)}#sms`, linkLabel: "Review text setup" };
  if (!number) return [sender, ...checks];
  sender.detail = `${number} — carrier registration has not been checked.`;
  if (!uniqueCompanyNumber(number, allBrands.filter(b => b.id !== brand.id).map(b => b.phoneNumbers))) return [{ ...sender, state: "needs_attention", detail: "This number is also assigned to another company in Lead Suite. Configure a separate sender before sending." }, ...checks];
  if (!key) return [{ ...sender, detail: `${number} is saved, but the messaging provider connection is missing.` }, ...checks];
  try {
    const raw = await read(`https://api.telnyx.com/v2/10dlc/phoneNumberCampaign/${encodeURIComponent(number.startsWith("+") ? number : `+1${number.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")}`)}`, key);
    const assignment = (raw.data || raw) as JsonRow & NumberAssignment;
    const id = assignment.telnyxCampaignId || assignment.campaignId;
    if (typeof id !== "string" || !id) throw new Error("not_found");
    const result = await read(`https://api.telnyx.com/v2/10dlc/campaign/${encodeURIComponent(id)}`, key);
    const campaign = (result.data || result) as { status?: string; campaignStatus?: string; tcrCampaignId?: string };
    sender.state = smsRegistrationState(campaign, assignment);
    const mappings = [assignment.attNumberMappingStatus && `AT&T: ${assignment.attNumberMappingStatus}`, assignment.tmobileNumberMappingStatus && `T-Mobile: ${assignment.tmobileNumberMappingStatus}`, assignment.nonTmobileNumberMappingStatus && `Other carriers: ${assignment.nonTmobileNumberMappingStatus}`].filter(Boolean).join(" · ");
    sender.detail = `${number} · Registration ${campaign.tcrCampaignId || ""}: ${campaign.campaignStatus || "unverified"} · Number: ${assignment.assignmentStatus || "unverified"}${mappings ? ` · ${mappings}` : ""}.`;
  } catch (error) {
    sender.state = error instanceof Error && error.message === "not_found" ? "not_connected" : "needs_attention";
    sender.detail = sender.state === "not_connected" ? `${number} has no confirmed assignment to an approved registration. A shared messaging profile alone is insufficient.` : `${number}: the live carrier check could not be completed. Refresh or review the provider account.`;
  }
  return [sender, ...checks];
}

export async function companyEmailReadiness(brand: Brand): Promise<ReadinessCheck[]> {
  const checks = [gate(brand, "email"), replyGate(brand, "email")];
  const sender: ReadinessCheck = { id: "email-sender", title: "Company email sender", state: "not_connected", detail: "No separate provider campaign is mapped for this company. Another company's connected mailbox does not activate this one.", href: `/company-setup?entity=${encodeURIComponent(brand.id)}#email`, linkLabel: "Review email setup" };
  const provider = emailProviderName();
  if (provider === "mock") return [sender, ...checks];
  let id: string | undefined;
  try { id = resolveCompanyCampaign(provider === "smartlead" ? "SMARTLEAD" : "INSTANTLY", brand.id); }
  catch { return [{ ...sender, state: "needs_attention", detail: "The provider campaign mapping is duplicated across companies. Give this company its own mapping." }, ...checks]; }
  if (!id) return [sender, ...checks];
  if (provider !== "smartlead") return [{ ...sender, state: "pending", detail: "A separate provider campaign is mapped. Mailbox and reply verification still need review." }, ...checks];
  const key = process.env.SMARTLEAD_API_KEY?.trim();
  if (!key) return [sender, ...checks];
  try {
    const root = `https://server.smartlead.ai/api/v1/campaigns/${encodeURIComponent(id)}`;
    const [accounts, hooks] = await Promise.all([read(`${root}/email-accounts?api_key=${encodeURIComponent(key)}`), read(`${root}/webhooks?api_key=${encodeURIComponent(key)}`)]);
    const rows: JsonRow[] = Array.isArray(accounts) ? accounts : Array.isArray(accounts.data) ? accounts.data : [];
    const own = rows.filter(a => mailboxBelongsToCompany(a.from_email, brand.domain));
    const connected = own.some(a => a.is_smtp_success === true || a.is_smtp_success === 1);
    sender.state = connected ? "active" : "needs_attention";
    sender.detail = own.length ? `${own.map(a => String(a.from_email)).join(", ")} · ${connected ? "Sending mailbox connection verified by Smartlead." : "Smartlead has not confirmed the sending mailbox connection."}` : "The mapped provider campaign has no confirmed sender matching this company's domain. Review the mailbox assignment.";
    const hookRows: JsonRow[] = Array.isArray(hooks) ? hooks : Array.isArray(hooks.data) ? hooks.data : [];
    const endpointOk = hookRows.some(h => { try { const url = new URL(String(h.webhook_url)); return Boolean(process.env.EMAIL_WEBHOOK_SECRET?.trim()) && url.origin === process.env.PUBLIC_APP_URL?.replace(/\/$/, "") && url.pathname === "/api/webhooks/email" && url.searchParams.get("token") === process.env.EMAIL_WEBHOOK_SECRET?.trim(); } catch { return false; } });
    const imapOk = own.some(a => a.is_imap_success === true || a.is_imap_success === 1);
    checks.push({ id: "email-tracking", title: "Email reply tracking", state: imapOk && endpointOk ? "active" : "pending", detail: imapOk && endpointOk ? "Smartlead confirms mailbox access and a matching CRM reply webhook. A live reply test confirms end-to-end delivery." : "Mailbox reply access or the CRM reply webhook still needs confirmation." });
  } catch { sender.state = "needs_attention"; sender.detail = "This company's live mailbox check could not be completed. Refresh or review its provider account."; }
  return [sender, ...checks];
}
