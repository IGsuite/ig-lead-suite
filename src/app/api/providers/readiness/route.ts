import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { isAdminSession } from "@/lib/acl";

/** Read-only provider diagnostics. Credentials and SMTP/IMAP account fields never leave the server. */
export async function GET() {
  const denied = await requireApiSession(); if (denied) return denied;
  if (!isAdminSession(await getSession())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const smartlead = async () => {
    const key = process.env.SMARTLEAD_API_KEY?.trim();
    if (!key) return { configured: false, campaigns: [] };
    try {
      const response = await fetch(`https://server.smartlead.ai/api/v1/campaigns/?api_key=${encodeURIComponent(key)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) return { configured: true, reachable: false, httpStatus: response.status, campaigns: [] };
      const body: unknown = await response.json();
      const rows = Array.isArray(body) ? body : [];
      const campaignId = process.env.SMARTLEAD_CAMPAIGN_ABSTRACT?.trim();
      let abstract: Record<string, unknown> = { mapped: Boolean(campaignId) };
      if (campaignId) {
        const get = async (suffix: string) => {
          const response = await fetch(`https://server.smartlead.ai/api/v1/campaigns/${encodeURIComponent(campaignId)}/${suffix}?api_key=${encodeURIComponent(key)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
          return response.ok ? await response.json() : null;
        };
        const [accounts, sequences, hooks] = await Promise.all([get("email-accounts"), get("sequences"), get("webhooks")]);
        const accountRows = Array.isArray(accounts) ? accounts : accounts?.data || [];
        const hookRows = Array.isArray(hooks) ? hooks : hooks?.data || [];
        abstract = { ...abstract, senderAccounts: accountRows.map((account: Record<string, unknown>) => ({ id: account.id, email: account.from_email, smtpSuccess: account.is_smtp_success, imapSuccess: account.is_imap_success, dailyLimit: account.message_per_day || account.max_email_per_day })), sequenceCount: Array.isArray(sequences) ? sequences.length : null,
          webhooks: hookRows.map((hook: Record<string, unknown>) => { let matches = false; try { const url = new URL(String(hook.webhook_url)); matches = url.origin === process.env.PUBLIC_APP_URL?.replace(/\/$/, "") && url.pathname === "/api/webhooks/email" && url.searchParams.get("token") === process.env.EMAIL_WEBHOOK_SECRET?.trim(); } catch {} return { id: hook.id, suiteEndpointConfigured: matches, events: hook.event_types || hook.event_type_map }; }) };
      }
      return { configured: true, reachable: true, abstract, campaigns: rows.slice(0, 100).map((row: Record<string, unknown>) => ({ id: String(row.id), name: String(row.name || ""), status: String(row.status || "") })) };
    } catch { return { configured: true, reachable: false, campaigns: [] }; }
  };
  const telnyx = async () => {
    const key = process.env.TELNYX_API_KEY?.trim();
    if (!key) return { configured: false, numbers: [] };
    try {
      const response = await fetch("https://api.telnyx.com/v2/phone_numbers?page[size]=250", { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) return { configured: true, reachable: false, httpStatus: response.status, numbers: [] };
      const body = await response.json() as { data?: Array<{ id?: string; phone_number?: string; status?: string; messaging_profile_id?: string }>; meta?: { total_results?: number } };
      return { configured: true, reachable: true, totalNumbers: body.meta?.total_results, numbers: (body.data || []).map(row => ({ id: row.id, number: row.phone_number, status: row.status, messagingProfileAssigned: Boolean(row.messaging_profile_id) })) };
    } catch { return { configured: true, reachable: false, numbers: [] }; }
  };
  const [email, sms] = await Promise.all([smartlead(), telnyx()]);
  return NextResponse.json({ email, sms, sendsPerformed: false }, { headers: { "Cache-Control": "private, no-store" } });
}
