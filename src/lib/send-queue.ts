import { sendingEnabled, sendingEntityEnabled, sendingChannelEnabled, assertCampaignSendingReady, activeSendingEntities } from "@/lib/dispatch-scheduler";
import { ensureEmailCampaign, emailCampaignFingerprint } from "@/lib/providers/campaign-setup";
import { emailProviderName, resolveCompanyCampaign } from "@/lib/providers/email";
import { randomUUID } from "crypto";
import { calendarRunAllowed, scheduleCalendarRuns } from "@/lib/marketing-calendar-store";
import { calendarDisposition } from "@/lib/marketing-calendar";
import { AUDIENCE_NOT_SELECTED, audienceContactKey } from "@/lib/audience-filters";
import { getPrisma } from "@/lib/db";
import { ensureSeeded } from "@/lib/neon-store-seed";
import { mapCampaign, mapEntity, mapLead, mapLeadSendEvent, mapRotation } from "@/lib/mappers";
import { selectLeadsForSend, messageFingerprint, buildSendEvents } from "@/lib/rotation-select";
import { isWithinSendWindow, sendWindowLabel, normalizeSendWindow } from "@/lib/send-window";
import { entityOfferCopy, tomorrowIso, type AutopilotRunResult } from "@/lib/autopilot";
import { deliverCampaignBatch } from "@/lib/send";
import type { Brand, Campaign, Lead } from "@/lib/types";
import type { LaunchResult } from "@/lib/neon-store-shared";
import type { Prisma } from "@/generated/prisma/client";

type JobPayload = { campaign: Campaign; brand: Brand; lead: Lead; providerCampaignId?: string };

/** One immutable outbox row per campaign/contact. No provider calls in transactions. */
export async function enqueueCampaign(id: string): Promise<LaunchResult | null> {
  await ensureSeeded();
  const db = getPrisma();
  const initial = await db.campaign.findUnique({ where: { id } });
  if (!initial) return null;
  if (initial.sourceFilter === AUDIENCE_NOT_SELECTED) throw new Error("Choose and save a lead source before launching this campaign.");
  if (!await calendarRunAllowed(id)) return {campaign:mapCampaign(initial),deferred:true,reason:"calendar_not_active"};
  assertCampaignSendingReady(initial.brandId, initial.channel);
  // Configure a separate provider campaign before entering the database transaction.
  // Draft creation never calls this function, and empty/out-of-window launches do not provision anything.
  if (initial.channel === "email" && emailProviderName() === "smartlead"
    && !["cancelled", "completed"].includes(initial.status) && isWithinSendWindow(mapCampaign(initial))
    && !(await db.sendJob.count({ where: { campaignId: id } }))) {
    const { getData } = await import("@/lib/neon-store");
    const data = await getData();
    const campaign = mapCampaign(initial), brand = data.brands.find(b => b.id === campaign.brandId);
    if (!brand) throw new Error("Business not found");
    const reservations = await db.sendJob.findMany({ where: { channel: "email", status: { in: ["queued", "processing", "uncertain"] } }, select: { leadId: true } });
    const reservedIds = new Set(reservations.map(j => j.leadId));
    const reserved = new Set(data.leads.filter(l=>reservedIds.has(l.id)).map(l=>audienceContactKey(l,"email")));
    const pick = selectLeadsForSend({ leads: data.leads.filter(l => !reserved.has(audienceContactKey(l,"email"))), sendEvents: data.sendEvents || [],
      entityId: campaign.brandId, channel: campaign.channel, volume: campaign.volume, mode: campaign.mode,
      messageFingerprint: messageFingerprint(campaign.channel, campaign.message, campaign.subject), sourceFilter: campaign.sourceFilter,
      groupFilter: campaign.groupFilter, preferVerified: campaign.preferVerified, preferUnoffered: campaign.preferUnoffered, poolCursor: data.rotation.poolCursor });
    if (pick.selected.length) await ensureEmailCampaign(campaign, brand);
  }
  return db.$transaction(async tx => {
    const locks = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('ig-send-enqueue')) AS acquired`;
    const row = await tx.campaign.findUnique({ where: { id } });
    if (!row) return null;
    const campaign = mapCampaign(row);
    if (campaign.sourceFilter === AUDIENCE_NOT_SELECTED) throw new Error("Choose and save a lead source before launching this campaign.");
    if (id.startsWith("camp-calendar-")) {
      const entry = await tx.marketingCalendarEntry.findUnique({where:{runCampaignId:id}});
      const settings = await tx.platformSettings.findUniqueOrThrow({where:{id:"default"}});
      if (!entry || calendarDisposition(entry,settings.calendarEnabled) !== "due") return {campaign,deferred:true,reason:"calendar_not_active"};
    }
    assertCampaignSendingReady(campaign.brandId, campaign.channel);
    if (!locks[0]?.acquired) return { campaign, deferred: true, reason: "already_launching" };
    if (["cancelled", "completed"].includes(campaign.status)) return { campaign, deferred: true, reason: campaign.status };
    if (!isWithinSendWindow(campaign)) {
      await tx.campaign.update({ where: { id }, data: { status: "scheduled" } });
      return { campaign: { ...campaign, status: "scheduled" }, deferred: true, reason: "outside_send_window", windowLabel: sendWindowLabel(campaign) };
    }
    const existing = await tx.sendJob.count({ where: { campaignId: id } });
    if (existing) {
      const resumed = await tx.campaign.update({ where: { id }, data: { status: "sending" } });
      return { campaign: mapCampaign(resumed), deferred: false, eligibleCount: existing };
    }
    const brandRow = await tx.entity.findUniqueOrThrow({ where: { id: row.brandId } });
    const brand = mapEntity(brandRow);
    let providerCampaignId: string | undefined;
    if (campaign.channel === "email") {
      const provider = emailProviderName();
      if (provider !== "mock") {
        const setup = provider === "smartlead" ? await tx.emailCampaignSetup.findUnique({ where: { campaignId: campaign.id } }) : null;
        const providerId = provider === "smartlead" ? setup?.providerCampaignId : resolveCompanyCampaign("INSTANTLY", campaign.brandId, campaign.id);
        providerCampaignId = providerId || undefined;
        // An empty audience is reported below without creating a provider campaign.
        if (provider !== "smartlead" && !providerId) throw new Error("Configure a distinct provider campaign for this company before launch");
        if (provider === "smartlead") {
          if (setup && (setup.brandId !== campaign.brandId || setup.state !== "ready" || setup.fingerprint !== emailCampaignFingerprint(campaign, brand)))
            throw new Error("The saved campaign changed during setup. Review its message and schedule before retrying.");
        }
      }
    } else {
      const normalize = (number: string) => number.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
      const from = brand.phoneNumbers[0];
      const others = await tx.entity.findMany({ where: { id: { not: brand.id } } });
      if (!from || others.some(other => other.phoneNumbers.some(number => normalize(number) === normalize(from)))) throw new Error("Configure a unique sending number for this company");
    }
    const leads = await tx.lead.findMany();
    const events = await tx.leadSendEvent.findMany({ where: { sentAt: { gte: new Date(Date.now() - 7 * 86400000) } } });
    const reservations = await tx.sendJob.findMany({ where: { status: { in: ["queued", "processing", "uncertain"] } }, select: { leadId: true, channel: true } });
    const reservedIds = new Set(reservations.filter(j => j.channel === campaign.channel).map(j => j.leadId));
    const reserved = new Set(leads.filter(l=>reservedIds.has(l.id)).map(l=>audienceContactKey(l,campaign.channel)));
    const settings = await tx.platformSettings.findUniqueOrThrow({ where: { id: "default" } });
    const rotation = mapRotation(settings, [brand]);
    const pick = selectLeadsForSend({ leads: leads.map(mapLead).filter(l => !reserved.has(audienceContactKey(l,campaign.channel))), sendEvents: events.map(mapLeadSendEvent), entityId: campaign.brandId,
      channel: campaign.channel, volume: campaign.volume, mode: campaign.mode, messageFingerprint: messageFingerprint(campaign.channel, campaign.message, campaign.subject),
      sourceFilter: campaign.sourceFilter, groupFilter: campaign.groupFilter, preferVerified: campaign.preferVerified, preferUnoffered: campaign.preferUnoffered, poolCursor: rotation.poolCursor });
    if (!pick.selected.length) return { campaign, deferred: false, emptyAudience: true, eligibleCount: 0, reason: "empty_audience" };
    if (campaign.channel === "email" && emailProviderName() === "smartlead" && !providerCampaignId) throw new Error("Email campaign setup is required before queuing recipients.");
    const start = Date.now();
    const interval = 3600000 / Math.max(1, campaign.throttlePerHour);
    for (let offset = 0; offset < pick.selected.length; offset += 500) {
      await tx.sendJob.createMany({ data: pick.selected.slice(offset, offset + 500).map((lead, index) => ({
        id: randomUUID(), campaignId: id, entityId: campaign.brandId, leadId: lead.id, channel: campaign.channel,
        payload: JSON.parse(JSON.stringify({ campaign, brand, lead, providerCampaignId })) as Prisma.InputJsonValue,
        scheduledAt: new Date(start + (offset + index) * interval),
      })) });
    }
    const updated = await tx.campaign.update({ where: { id }, data: { status: "sending", startedAt: new Date() } });
    return { campaign: mapCampaign(updated), deferred: false, eligibleCount: pick.selected.length };
  }, { timeout: 60000 });
}

/** Daily IDs use the company's configured timezone. Repeated cron/manual runs reuse them. */
export async function scheduleAutopilot(force = false): Promise<AutopilotRunResult> {
  if (!sendingEnabled()) return { ranAt: new Date().toISOString(), nextRunAt: tomorrowIso(), legs: [] };
  await ensureSeeded();
  const db = getPrisma();
  const settings = await db.platformSettings.findUniqueOrThrow({ where: { id: "default" } });
  const brands = (await db.entity.findMany()).map(mapEntity);
  const rotation = mapRotation(settings, brands);
  const result: AutopilotRunResult = { ranAt: new Date().toISOString(), nextRunAt: tomorrowIso(), legs: [] };
  if (settings.calendarEnabled) {
    for (const id of await scheduleCalendarRuns()) {
      try {
        const queued = await enqueueCampaign(id);
        if (queued) result.legs.push({entityId:queued.campaign.brandId,channel:queued.campaign.channel,campaignId:id,sent:queued.campaign.sentCount,volume:queued.campaign.volume});
      } catch (error) {
        await db.marketingCalendarEntry.update({where:{runCampaignId:id},data:{error:error instanceof Error ? error.message:"Campaign setup failed"}});
      }
    }
    return result;
  }
  if (!force && !rotation.autopilotEnabled) return result;
  for (const entityId of rotation.entityOrder) {
    const brand = brands.find(b => b.id === entityId);
    const quota = rotation.quotas.find(q => q.entityId === entityId);
    if (!brand?.rotationEnabled || !quota?.enabled || !sendingEntityEnabled(entityId)) continue;
    const window = normalizeSendWindow(quota);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: window.timezone }).format(new Date());
    const copy = entityOfferCopy(brand);
    for (const channel of ["sms", "email"] as const) {
      if (!sendingChannelEnabled(channel)) continue;
      const volume = channel === "sms" ? quota.dailySmsVolume : quota.dailyEmailVolume;
      if (volume <= 0) continue;
      const id = `camp-auto-${entityId}-${channel}-${day}`;
      const campaign = await db.campaign.upsert({ where: { id }, update: {}, create: {
        id, brandId: entityId, name: `Autopilot · ${brand.shortName} · ${channel.toUpperCase()} · ${day}`, channel, volume,
        subject: channel === "email" ? copy.emailSubject : null, message: channel === "email" ? copy.emailBody : copy.sms,
        sourceFilter: "all", groupFilter: "all", preferUnoffered: false, preferVerified: true, mode: "auto", throttlePerHour: Math.max(60, Math.round(volume / 12)), ...window, status: "scheduled",
      } });
      await enqueueCampaign(id);
      result.legs.push({ entityId, channel, campaignId: id, sent: campaign.sentCount, volume });
    }
  }
  await db.platformSettings.update({ where: { id: "default" }, data: { autopilotEnabled: true, autopilotJson: JSON.parse(JSON.stringify({ ...settings.autopilotJson as object, lastRunAt: result.ranAt, nextRunAt: result.nextRunAt })) } });
  return result;
}

/** Atomic cross-instance lease. Expiry recovers a crashed cron, never a provider send. */
export async function dispatchQueuedSends() {
  if (!sendingEnabled()) return { busy: false, processed: 0, paused: true };
  const db = getPrisma();
  const owner = randomUUID();
  const acquired = await db.$queryRaw<Array<{ owner: string }>>`INSERT INTO "WorkerLease" (id, owner, "expiresAt") VALUES ('dispatch', ${owner}, NOW() + interval '5 minutes') ON CONFLICT (id) DO UPDATE SET owner = EXCLUDED.owner, "expiresAt" = EXCLUDED."expiresAt" WHERE "WorkerLease"."expiresAt" < NOW() RETURNING owner`;
  if (!acquired.some(lease => lease.owner === owner)) return { busy: true, processed: 0 };
  let processed = 0;
  const stopAt = Date.now() + 170000;
  try {
    // An interrupted provider request may have succeeded. Require reconciliation rather than duplicate it.
    await db.sendJob.updateMany({ where: { status: "processing", claimedAt: { lt: new Date(Date.now() - 600000) } }, data: { status: "uncertain", error: "Worker interrupted; reconcile provider before retrying" } });
    await scheduleAutopilot();
    for (const c of await db.campaign.findMany({ where: { status: "scheduled" }, take: 25 })) if (!c.id.startsWith("camp-calendar-") && sendingEntityEnabled(c.brandId) && sendingChannelEnabled(c.channel)) await enqueueCampaign(c.id);
    while (processed < 200 && Date.now() < stopAt) {
      const jobs = await db.sendJob.findMany({ where: { status: "queued", scheduledAt: { lte: new Date() }, ...(activeSendingEntities()?.length ? { entityId: { in: activeSendingEntities() } } : {}) }, orderBy: { scheduledAt: "asc" }, take: 100 });
      let eligibleJob: typeof jobs[number] | undefined;
      for (const job of jobs) {
        const campaign = await db.campaign.findUnique({ where: { id: job.campaignId } });
        if (!campaign || campaign.status === "cancelled") {
          await db.sendJob.update({ where: { id: job.id }, data: { status: "skipped", error: "Campaign cancelled", finishedAt: new Date() } });
          continue;
        }
        if (!sendingEntityEnabled(job.entityId) || !sendingChannelEnabled(job.channel)) continue;
        if (!await calendarRunAllowed(job.campaignId)) continue;
        if (campaign.status === "sending" && isWithinSendWindow(mapCampaign(campaign))) {
          const prior = await db.sendJob.findFirst({ where: { campaignId: campaign.id, claimedAt: { not: null } }, orderBy: { claimedAt: "desc" }, select: { claimedAt: true } });
          const nextAllowed = prior?.claimedAt ? prior.claimedAt.getTime() + 3600000 / Math.max(1, campaign.throttlePerHour) : 0;
          if (nextAllowed > Date.now()) {
            await db.sendJob.updateMany({ where: { id: job.id, status: "queued" }, data: { scheduledAt: new Date(nextAllowed) } });
            continue;
          }
          eligibleJob = job; break;
        }
        await db.sendJob.updateMany({ where: { id: job.id, status: "queued" }, data: { scheduledAt: new Date(Date.now() + 60000) } });
      }
      if (!eligibleJob) break;
      const job = eligibleJob;
      if (!await calendarRunAllowed(job.campaignId)) continue;
      const claim = await db.sendJob.updateMany({ where: { id: job.id, status: "queued" }, data: { status: "processing", claimedAt: new Date() } });
      if (!claim.count) continue;
      processed++;
      const payload = job.payload as unknown as JobPayload;
      const current = await db.lead.findUnique({ where: { id: job.leadId } });
      const brandRow = await db.entity.findUnique({ where: { id: job.entityId } });
      if (!current || current.optedOut || ["converted", "opted_out"].includes(current.status) || current.convertedEntityId || (job.channel === "email" && current.emailStatus === "invalid") || !brandRow) {
        await db.sendJob.update({ where: { id: job.id }, data: { status: "skipped", error: "Contact unavailable, converted, or opted out", finishedAt: new Date() } });
      } else {
        try {
          // Check again after claiming: an operator can pause the calendar at any time.
          if (!await calendarRunAllowed(job.campaignId)) {
            await db.sendJob.update({where:{id:job.id},data:{status:"queued",claimedAt:null}});
            continue;
          }
          const summary = await deliverCampaignBatch({ campaign: payload.campaign, brand: payload.brand, leads: [mapLead(current)], liveCap: 1, providerCampaignId: payload.providerCampaignId });
          const result = summary.results[0];
          if (result?.status === "accepted") {
            await db.$transaction(async tx => {
              const lead = await tx.lead.findUniqueOrThrow({ where: { id: current.id } });
              const event = buildSendEvents({ leads: [mapLead(lead)], entityId: job.entityId, campaignId: job.campaignId, channel: payload.campaign.channel,
                messageFingerprint: messageFingerprint(payload.campaign.channel, payload.campaign.message, payload.campaign.subject), mode: payload.campaign.mode })[0];
              await tx.leadSendEvent.create({ data: { ...event, sentAt: new Date(event.sentAt) } });
              await tx.lead.update({ where: { id: lead.id }, data: { offeredEntityIds: [...new Set([...lead.offeredEntityIds, job.entityId])], lastEntityId: job.entityId,
                ...(lead.optedOut || ["replied", "converted", "opted_out"].includes(lead.status) ? {} : { status: "contacted" }) } });
              await tx.campaign.update({ where: { id: job.campaignId }, data: { sentCount: { increment: 1 } } });
              const receipt = result.providerId && payload.campaign.channel === "sms" ? await tx.deliveryReceipt.findUnique({ where: { providerId: result.providerId } }) : null;
              await tx.sendJob.update({ where: { id: job.id }, data: { status: receipt?.status || "accepted", providerId: result.providerId, finishedAt: new Date() } });
            });
          } else {
            await db.sendJob.update({ where: { id: job.id }, data: { status: result?.status === "skipped" ? "skipped" : result?.status === "uncertain" ? "uncertain" : "failed", error: result?.error || "Provider did not accept contact", finishedAt: new Date() } });
          }
        } catch {
          await db.sendJob.update({ where: { id: job.id }, data: { status: "uncertain", error: "Provider outcome or persistence uncertain; reconcile before retrying", finishedAt: new Date() } });
        }
      }
      const remaining = await db.sendJob.count({ where: { campaignId: job.campaignId, status: { in: ["queued", "processing", "uncertain"] } } });
      if (!remaining) await db.campaign.updateMany({ where: { id: job.campaignId, status: "sending" }, data: { status: "completed" } });
    }
    return { busy: false, processed };
  } finally {
    await db.workerLease.deleteMany({ where: { id: "dispatch", owner } });
  }
}
