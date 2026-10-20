import { NextResponse } from "next/server";
import { parseSmsReply } from "@/lib/inbound-events";
import { mapEntity } from "@/lib/mappers";
import { validTelnyxWebhook, processWebhook } from "@/lib/webhook-security";
import { ingestReply } from "@/lib/neon-store-ops";

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validTelnyxWebhook(raw, request.headers)) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const event = body.data;
  const payload = event?.payload;
  if (!event?.id || !payload) return NextResponse.json({ error: "Missing event" }, { status: 400 });
  const outcome = await processWebhook("telnyx", raw, event.id, async tx => {
    if (["message.finalized", "message.sent"].includes(event.event_type)) {
      const statuses = (Array.isArray(payload.to) ? payload.to : []).map((to: { status?: string }) => to.status);
      const status = statuses.includes("delivered") ? "delivered" : statuses.some((s: string) => ["delivery_failed", "sending_failed", "failed"].includes(s)) ? "failed" : "accepted";
      if (payload.id) {
        const prior = await tx.deliveryReceipt.findUnique({ where: { providerId: payload.id } });
        const finalStatus = prior && ["delivered", "failed"].includes(prior.status) ? prior.status : status;
        await tx.deliveryReceipt.upsert({ where: { providerId: payload.id }, create: { providerId: payload.id, status: finalStatus }, update: { status: finalStatus } });
        if (["delivered", "failed"].includes(finalStatus)) await tx.inboxSend.updateMany({ where: { providerId: payload.id, channel: "sms", status: { in: ["accepted", "sending", "unknown"] } }, data: { status: finalStatus } });
        await tx.sendJob.updateMany({ where: { providerId: payload.id, channel: "sms", status: { in: ["accepted", "processing", "uncertain"] } }, data: { status: finalStatus, finishedAt: new Date() } });
      }
      return { receipt: true };
    }
    if (event.event_type !== "message.received" || payload.direction === "outbound") return { ignored: true };
    const input = parseSmsReply(body, (await tx.entity.findMany()).map(mapEntity));
    return input ? ingestReply(input, tx) : { ignored: true };
  });
  return NextResponse.json({ ok: true, duplicate: outcome.duplicate });
}
