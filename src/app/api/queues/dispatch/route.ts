import { handleCallback } from "@vercel/queue";
import { dispatchQueuedSends } from "@/lib/send-queue";
import { sendingEnabled, sendingEntityEnabled, sendingChannelEnabled, wakeDispatcher } from "@/lib/dispatch-scheduler";
import { getPrisma } from "@/lib/db";
import { dispatchWakeDelay } from "@/lib/dispatch-timing";
export const maxDuration = 300;

// Vercel authenticates queue callbacks; the SDK fetches the message using deployment credentials.
const callback = handleCallback<{ kind: string }>(async message => {
  if (message.kind === "probe") {
    await getPrisma().workerLease.upsert({ where: { id: "queue-probe" }, create: { id: "queue-probe", owner: "received", expiresAt: new Date() }, update: { owner: "received", expiresAt: new Date() } });
    return;
  }
  if (message.kind !== "dispatch" || !sendingEnabled()) return;
  await dispatchQueuedSends();
  const db = getPrisma();
  const settings = await db.platformSettings.findUniqueOrThrow({where:{id:"default"}});
  if (settings.calendarEnabled && await db.marketingCalendarEntry.count({where:{status:{in:["approved","started"]}}})) {
    const running = (await db.campaign.findMany({where:{id:{startsWith:"camp-calendar-"},status:"sending"},select:{id:true,brandId:true,channel:true}}))
      .filter(c=>sendingEntityEnabled(c.brandId)&&sendingChannelEnabled(c.channel));
    const next = running.length ? await db.sendJob.findFirst({where:{campaignId:{in:running.map(c=>c.id)},status:"queued"},orderBy:{scheduledAt:"asc"},select:{scheduledAt:true}}) : null;
    await wakeDispatcher(dispatchWakeDelay(next?.scheduledAt || null));
    return;
  }
  const active = (await db.campaign.findMany({ where: { status: { in: ["scheduled", "sending"] } }, select: { id: true, brandId: true, channel: true, status: true } }))
    .filter(c => !c.id.startsWith("camp-calendar-") && sendingEntityEnabled(c.brandId) && sendingChannelEnabled(c.channel));
  // An idle, manual-only suite does not need an endless queue polling loop.
  if (active.some(c => c.status === "scheduled") || (active.length && await db.sendJob.count({ where: { campaignId: { in: active.map(c => c.id) }, status: "queued" } })))
    await wakeDispatcher(60);
}, { retry: () => ({ afterSeconds: 60 }) });

export async function POST(request: Request): Promise<Response> {
  return callback(request);
}
