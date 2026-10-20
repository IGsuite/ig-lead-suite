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
      return { configured: true, reachable: true, campaigns: rows.slice(0, 100).map((row: Record<string, unknown>) => ({ id: String(row.id), name: String(row.name || ""), status: String(row.status || "") })) };
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
