import { handleCallback } from "@vercel/queue";
import { dispatchQueuedSends } from "@/lib/send-queue";
import { sendingEnabled, sendingEntityEnabled, sendingChannelEnabled, wakeDispatcher } from "@/lib/dispatch-scheduler";
import { getPrisma } from "@/lib/db";
export const maxDuration = 300;

// Vercel authenticates queue callbacks; the SDK fetches the message using deployment credentials.
export const POST = handleCallback<{ kind: string }>(async message => {
  if (message.kind === "probe") {
    await getPrisma().workerLease.upsert({ where: { id: "queue-probe" }, create: { id: "queue-probe", owner: "received", expiresAt: new Date() }, update: { owner: "received", expiresAt: new Date() } });
    return;
  }
  if (message.kind !== "dispatch" || !sendingEnabled()) return;
  await dispatchQueuedSends();
  const db = getPrisma();
  const settings = await db.platformSettings.findUniqueOrThrow({where:{id:"default"}});
  if (settings.calendarEnabled && await db.marketingCalendarEntry.count({where:{status:{in:["approved","started"]}}})) {
    await wakeDispatcher(60);
    return;
  }
  const active = (await db.campaign.findMany({ where: { status: { in: ["scheduled", "sending"] } }, select: { id: true, brandId: true, channel: true, status: true } }))
    .filter(c => !c.id.startsWith("camp-calendar-") && sendingEntityEnabled(c.brandId) && sendingChannelEnabled(c.channel));
  // An idle, manual-only suite does not need an endless queue polling loop.
  if (active.some(c => c.status === "scheduled") || (active.length && await db.sendJob.count({ where: { campaignId: { in: active.map(c => c.id) }, status: "queued" } })))
    await wakeDispatcher(60);
}, { retry: () => ({ afterSeconds: 60 }) });
