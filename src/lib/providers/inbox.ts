import { emailAddress, mailboxMatchesBrand, phoneIdentity } from "@/lib/reply-routing";
import type { Brand, Reply } from "@/lib/types";

type Fields = Record<string, unknown>;
const obj = (value: unknown): Fields => value && typeof value === "object" ? value as Fields : {};
const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : "";

export class InboxProviderError extends Error {
  constructor(message: string, public uncertain = false) { super(message); }
}

async function smartlead(path: string): Promise<Fields> {
  const key = process.env.SMARTLEAD_API_KEY?.trim();
  if (!key) throw new InboxProviderError("Email replies are not configured on this server");
  let response: Response;
  try { response = await fetch(`https://server.smartlead.ai/api/v1${path}${path.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(key)}`,
    { cache: "no-store", signal: AbortSignal.timeout(15_000) }); }
  catch { throw new InboxProviderError("Could not load the email conversation. Please try again."); }
  if (!response.ok) throw new InboxProviderError(`Email conversation lookup failed (${response.status})`);
  return obj(await response.json());
}

/** Resolve a real thread; never substitute a new campaign send or another brand's mailbox. */
export async function resolveEmailThread(reply: Reply, brand: Brand): Promise<{ campaignId: string; statsId: string; mailbox: string }> {
  const context = reply.providerContext;
  const campaignId = context?.campaignId || process.env[`SMARTLEAD_CAMPAIGN_${brand.id.toUpperCase()}`]?.trim();
  if (!campaignId || !/^\d+$/.test(campaignId)) throw new InboxProviderError("This reply has no email campaign reference. Reconnect or import its original conversation.");
  const lead = await smartlead(`/leads/?email=${encodeURIComponent(reply.from)}`);
  if (emailAddress(text(lead.email)) !== emailAddress(reply.from)) throw new InboxProviderError("The email provider could not verify this recipient");
  const membership = Array.isArray(lead.lead_campaign_data) ? lead.lead_campaign_data.map(obj) : [];
  if (!membership.some((c) => text(c.campaign_id) === campaignId)) throw new InboxProviderError("Recipient is not in the original email campaign");
  const leadId = text(lead.id);
  if (!/^\d+$/.test(leadId)) throw new InboxProviderError("Email provider lead reference is missing");
  const history = await smartlead(`/campaigns/${campaignId}/leads/${leadId}/message-history?show_plain_text_response=true`);
  const messages: Fields[] = (Array.isArray(history.history) ? history.history : Array.isArray(history.messages) ? history.messages : []).map(obj);
  const inbound = messages.filter((m) => ["reply", "inbound"].includes(text(m.type || m.direction).toLowerCase()));
  const latest = inbound.sort((a, b) => Date.parse(text(b.time || b.received_at || b.sent_at)) - Date.parse(text(a.time || a.received_at || a.sent_at)))[0];
  // email_stats_id is explicit; legacy Smartlead history uses numeric `id` for the stats row.
  const statsId = text(latest?.stats_id || latest?.email_stats_id || (latest && /^\d+$/.test(text(latest.id)) ? latest.id : undefined));
  if (!latest || !statsId) throw new InboxProviderError("The provider has not supplied a reply thread yet. Check that its mailbox has received the client's reply.");
  const campaignAccounts = await smartlead(`/campaigns/${campaignId}/email-accounts`);
  const accounts = (Array.isArray(campaignAccounts) ? campaignAccounts : Array.isArray(campaignAccounts.data) ? campaignAccounts.data : [] as unknown[]).map(obj);
  const recordedMailbox = emailAddress(text(history.from || history.from_email || history.email_account || latest.to || latest.to_email));
  if (context?.mailbox && emailAddress(context.mailbox) !== recordedMailbox) throw new InboxProviderError("The recorded mailbox does not match the provider's original sender");
  if (emailAddress(text(history.to)) && emailAddress(text(history.to)) !== emailAddress(reply.from)) throw new InboxProviderError("Email conversation recipient does not match this lead");
  if (!recordedMailbox || !mailboxMatchesBrand(recordedMailbox, brand)) throw new InboxProviderError("The original sender mailbox is not assigned to this brand");
  // A campaign using multiple brands cannot safely select a sender implicitly.
  if (!accounts.length || accounts.some((a) => !mailboxMatchesBrand(text(a.from_email || a.email || a.username), brand)))
    throw new InboxProviderError("This email campaign must use mailboxes belonging to this brand only");
  if (!accounts.some((a) => emailAddress(text(a.from_email || a.email || a.username)) === recordedMailbox))
    throw new InboxProviderError("The original sender mailbox is no longer connected to the campaign");
  return { campaignId, statsId, mailbox: recordedMailbox };
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");
}

export async function submitInboxReply(reply: Reply, brand: Brand, body: string, emailThread?: Awaited<ReturnType<typeof resolveEmailThread>>): Promise<string | undefined> {
  let url: string, headers: Record<string, string>, payload: object;
  if (reply.channel === "email") {
    const key = process.env.SMARTLEAD_API_KEY?.trim();
    if (!key || !emailThread) throw new InboxProviderError("Email replies are not configured");
    url = `https://server.smartlead.ai/api/v1/campaigns/${emailThread.campaignId}/reply-email-thread?api_key=${encodeURIComponent(key)}`;
    headers = { "Content-Type": "application/json" };
    payload = { email_stats_id: emailThread.statsId, email_body: escapeHtml(body), to_email: reply.from, add_signature: true };
  } else {
    const key = process.env.TELNYX_API_KEY?.trim(), mailbox = reply.providerContext?.mailbox;
    if (!key) throw new InboxProviderError("Text replies are not configured on this server");
    if (!mailbox || !brand.phoneNumbers.some((p) => phoneIdentity(p) === phoneIdentity(mailbox)))
      throw new InboxProviderError("The original receiving phone number is not assigned to this brand");
    url = "https://api.telnyx.com/v2/messages";
    headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    payload = { from: `+${phoneIdentity(mailbox)}`, to: `+${phoneIdentity(reply.from)}`, text: body };
  }
  let response: Response;
  try { response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000) }); }
  catch { throw new InboxProviderError("Delivery status is unknown. Check the conversation before sending again.", true); }
  if (!response.ok) throw new InboxProviderError(`The message provider rejected this reply (${response.status}). Check the mailbox or number connection.`, response.status >= 500);
  let result: Fields;
  try { result = obj(await response.json()); }
  catch { throw new InboxProviderError("The provider accepted the request but returned no confirmation. Check before resending.", true); }
  if (result.ok === false || result.success === false || result.error || result.errors)
    throw new InboxProviderError("The message provider could not accept this reply");
  return text(result.id || result.job_id || obj(result.data).id) || undefined;
}
