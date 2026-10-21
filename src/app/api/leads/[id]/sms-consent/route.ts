import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { canAccessEntity } from "@/lib/acl";
import { withdrawSmsConsent } from "@/lib/sms-consent-store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiSession(); if (unauthorized) return unauthorized;
  const session = await getSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.brandId !== "string" || body?.action !== "withdraw") return NextResponse.json({ error: "Invalid consent action" }, { status: 400 });
  if (!canAccessEntity(session, body.brandId)) return NextResponse.json({ error: "Business access required" }, { status: 403 });
  try { await withdrawSmsConsent((await context.params).id, body.brandId, session?.userId || "local-operator"); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Could not update this consent record" }, { status: 422 }); }
}
