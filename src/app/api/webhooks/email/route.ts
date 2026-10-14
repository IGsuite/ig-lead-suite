import { NextResponse } from "next/server";
import { ingestReply } from "@/lib/store";

/**
 * Cold-email reply webhook (Instantly / Smartlead / similar).
 * For now accepts a simple JSON shape so you can test inbound triage.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    from?: string;
    email?: string;
    text?: string;
    body?: string;
    brandId?: string;
    campaignId?: string;
  };

  const from = body.from || body.email || "";
  const text = body.text || body.body || "";

  if (!from || !text) {
    return NextResponse.json(
      { error: "Missing from/email and text/body" },
      { status: 400 },
    );
  }

  const reply = await ingestReply({
    channel: "email",
    from,
    body: text,
    brandId: body.brandId,
    campaignId: body.campaignId,
  });

  return NextResponse.json({ ok: true, reply });
}
