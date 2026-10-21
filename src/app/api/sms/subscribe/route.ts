import { NextResponse } from "next/server";
import { ConsentLimitError, subscribeAbstractSms } from "@/lib/sms-consent-store";
import { smsPhone, SMS_DISCLOSURE_VERSION } from "@/lib/sms-consent";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Submit the signup form from this website" }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 4096) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid form" }, { status: 400 }); }
  if (!body || typeof body !== "object" || body.website) return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  if (body.consent !== true) return NextResponse.json({ message: "You have not subscribed to texts. No SMS permission was recorded." });
  if (body.version !== SMS_DISCLOSURE_VERSION || typeof body.phone !== "string" || !smsPhone(body.phone)) return NextResponse.json({ error: "Enter a valid US number and review the current SMS consent language" }, { status: 400 });
  const canonical = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "") || new URL(request.url).origin;
  try {
    await subscribeAbstractSms(body.phone, `${canonical}/sms/abstract`, request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown");
    return NextResponse.json({ message: "Your choice has been received. Existing opt-outs remain in effect. The text program is awaiting activation; no text has been sent." });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ConsentLimitError ? "Too many requests. Please try again in an hour." : "We could not save your choice. Please try again later or contact info@abstractcapitalgroup.com." }, { status: e instanceof ConsentLimitError ? 429 : 503 });
  }
}
