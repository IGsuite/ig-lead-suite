import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { isAdminSession } from "@/lib/acl";
import { getPrisma } from "@/lib/db";

/** Scoped, admin-only wiring. Never starts a campaign, changes copy, or sends a message. */
export async function POST(request: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  if (!isAdminSession(await getSession())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const input = await request.json().catch(() => ({}));
  const origin = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!origin || new URL(origin).protocol !== "https:") return NextResponse.json({ error: "Configure PUBLIC_APP_URL" }, { status: 503 });
  try {
    if (input.action === "email") {
      const key = process.env.SMARTLEAD_API_KEY?.trim();
      const campaign = process.env.SMARTLEAD_CAMPAIGN_ABSTRACT?.trim();
      // An administrator may supply the destination environment's webhook credential for staged setup.
      const secret = typeof input.webhookCredential === "string" ? input.webhookCredential : process.env.EMAIL_WEBHOOK_SECRET?.trim();
      if (!key || !campaign || !secret || secret.length < 32) return NextResponse.json({ error: "Email integration is incomplete" }, { status: 503 });
      const target = new URL("/api/webhooks/email", origin); target.searchParams.set("token", secret);
      const api = `https://server.smartlead.ai/api/v1/campaigns/${encodeURIComponent(campaign)}/webhooks?api_key=${encodeURIComponent(key)}`;
      const listed = await fetch(api, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!listed.ok) return NextResponse.json({ error: "Unable to inspect existing email callbacks", httpStatus: listed.status }, { status: 502 });
      const value = await listed.json();
      const rows = Array.isArray(value) ? value : value.data || [];
      const events = ["EMAIL_REPLY", "UNTRACKED_REPLIES", "EMAIL_SENT", "EMAIL_BOUNCE", "LEAD_UNSUBSCRIBED"];
      const installed: string[] = [];
      for (const event of events) {
        const matches = rows.filter((row: Record<string, unknown>) => { try { const url = new URL(String(row.webhook_url)); return url.origin === origin && url.pathname === target.pathname && (row.event_types as string[] | undefined)?.includes(event); } catch { return false; } });
        // Update only a uniquely matching callback on this application's endpoint; leave unrelated integrations alone.
        if (matches.length > 1) return NextResponse.json({ error: "Duplicate suite callbacks require review", event }, { status: 409 });
        const existing = matches[0];
        const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ id: existing?.id || null, name: `IG Lead Suite Abstract ${event}`, webhook_url: target.toString(), event_types: [event] }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok === false || result.success === false) return NextResponse.json({ error: "Email callback configuration failed", event, httpStatus: response.status }, { status: 502 });
        installed.push(event);
      }
      return NextResponse.json({ connected: true, entityId: "abstract", events: installed, sendsPerformed: false });
    }
    if (input.action === "sms") {
      const key = process.env.TELNYX_API_KEY?.trim();
      if (!key) return NextResponse.json({ error: "Telnyx is not configured" }, { status: 503 });
      const brand = await getPrisma().entity.findUniqueOrThrow({ where: { id: "abstract" } });
      const number = brand.phoneNumbers[0];
      const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
      const listed = await fetch("https://api.telnyx.com/v2/phone_numbers?page[size]=250", { headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!listed.ok) return NextResponse.json({ error: "Unable to inspect sending number" }, { status: 502 });
      const data = await listed.json();
      const matches = (data.data || []).filter((row: { phone_number: string }) => row.phone_number === number);
      const profileId = matches.length === 1 && matches[0].messaging_profile_id;
      if (!profileId) return NextResponse.json({ error: "Abstract needs an assigned messaging profile" }, { status: 409 });
      const response = await fetch(`https://api.telnyx.com/v2/messaging_profiles/${encodeURIComponent(profileId)}`, { method: "PATCH", headers, signal: AbortSignal.timeout(15000), body: JSON.stringify({ webhook_url: `${origin}/api/webhooks/telnyx`, webhook_api_version: "2" }) });
      if (!response.ok) return NextResponse.json({ error: "Unable to configure SMS callback", httpStatus: response.status }, { status: 502 });
      return NextResponse.json({ connected: true, entityId: "abstract", signatureKeyConfigured: Boolean(process.env.TELNYX_PUBLIC_KEY?.trim()), sendsPerformed: false });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Provider setup did not complete; inspect configuration before retrying" }, { status: 502 }); }
}
