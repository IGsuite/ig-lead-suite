import { NextResponse } from "next/server";
import { ingestReply } from "@/lib/store";

/**
 * Telnyx inbound SMS webhook.
 * Point Mission Control → Messaging → webhook URL to /api/webhooks/telnyx
 * Payload shape varies; we accept common fields + a simple demo body.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    data?: {
      event_type?: string;
      payload?: {
        from?: { phone_number?: string };
        to?: Array<{ phone_number?: string }> | { phone_number?: string };
        text?: string;
        direction?: string;
      };
    };
    from?: string;
    text?: string;
    brandId?: string;
  };

  const payload = body.data?.payload;
  const from =
    payload?.from?.phone_number ||
    body.from ||
    "";
  const text = payload?.text || body.text || "";

  if (!from || !text) {
    return NextResponse.json(
      { error: "Missing from/text — expected Telnyx inbound SMS payload" },
      { status: 400 },
    );
  }

  // Only ingest inbound (ignore delivery receipts)
  const event = body.data?.event_type || "";
  if (event && !event.includes("received") && payload?.direction === "outbound") {
    return NextResponse.json({ ignored: true, reason: "not inbound" });
  }

  const reply = await ingestReply({
    channel: "sms",
    from,
    body: text,
    brandId: body.brandId,
  });

  return NextResponse.json({ ok: true, reply });
}
