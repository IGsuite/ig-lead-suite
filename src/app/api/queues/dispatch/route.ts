import { handleCallback } from "@vercel/queue";
import { dispatchQueuedSends } from "@/lib/send-queue";
import { sendingEnabled, wakeDispatcher } from "@/lib/dispatch-scheduler";
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
  await wakeDispatcher(60);
}, { retry: () => ({ afterSeconds: 60 }) });
