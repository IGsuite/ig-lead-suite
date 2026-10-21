import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/db";
import { mapCampaign, mapMessageTemplate } from "@/lib/mappers";
import { calendarInput, calendarDates, calendarSnapshot, calendarDisposition, type CalendarEntry } from "@/lib/marketing-calendar";
import { assertCampaignSendingReady } from "@/lib/dispatch-scheduler";
import type { Prisma } from "@/generated/prisma/client";

export async function saveCalendarDrafts(raw: unknown) {
  const input = calendarInput.parse(raw);
  const dates = calendarDates(input);
  const db = getPrisma();
  const campaign = await db.campaign.findUniqueOrThrow({where:{id:input.campaignId}});
  const template = input.templateId ? await db.messageTemplate.findUniqueOrThrow({where:{id:input.templateId}}) : undefined;
  const snapshot = calendarSnapshot(mapCampaign(campaign), template ? mapMessageTemplate(template) : undefined, input);
  if (!snapshot.message.trim() || (snapshot.channel === "email" && !snapshot.subject?.trim())) throw new Error("Campaign copy and email subject are required");
  const entries = dates.map(date => {
    const id = randomUUID();
    return {id,brandId:input.brandId,product:input.product,date,startTime:input.startTime,endTime:input.endTime,timezone:input.timezone,channel:campaign.channel,campaignId:campaign.id,templateId:template?.id || null,
      snapshot:JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue, status:"draft",runCampaignId:`camp-calendar-${id}`};
  });
  // One save is atomic, including a month of repeated weekdays. It has no provider side effects.
  await db.marketingCalendarEntry.createMany({data:entries});
  return entries;
}

export async function changeCalendarEntries(ids: string[], action: "approve" | "pause") {
  const db = getPrisma();
  return db.$transaction(async tx => {
    const entries = await tx.marketingCalendarEntry.findMany({where:{id:{in:ids}}});
    if (entries.length !== ids.length) throw new Error("A calendar entry no longer exists");
    for (const entry of entries) {
      if (action === "approve") {
        assertCampaignSendingReady(entry.brandId,entry.channel);
        if (!["draft","paused","approved"].includes(entry.status)) throw new Error("Started or expired entries cannot be approved again");
        if (calendarDisposition(entry,false) === "expired") throw new Error("Past entries cannot be activated; create a new dated draft");
        if (await tx.campaign.findUnique({where:{id:entry.runCampaignId}})) throw new Error("This run already started. Create a new date instead of changing its saved copy");
      }
    }
    await tx.marketingCalendarEntry.updateMany({where:{id:{in:ids}},data:{status:action === "approve" ? "approved":"paused",error:null}});
    if (action === "pause") await tx.campaign.updateMany({where:{id:{in:entries.map(e=>e.runCampaignId)},status:{in:["sending","scheduled"]}},data:{status:"paused"}});
    return {updated:entries.length};
  });
}

/** Fail closed even when someone clicks Launch on a calendar run from the normal campaign list. */
export async function calendarRunAllowed(id: string, now = new Date()) {
  if (!id.startsWith("camp-calendar-")) return true;
  const db = getPrisma();
  const [entry, settings] = await Promise.all([
    db.marketingCalendarEntry.findUnique({where:{runCampaignId:id}}),
    db.platformSettings.findUnique({where:{id:"default"}}),
  ]);
  return !!entry && calendarDisposition(entry,settings?.calendarEnabled === true,now) === "due";
}

export async function scheduleCalendarRuns(now = new Date()) {
  const db = getPrisma();
  const settings = await db.platformSettings.findUniqueOrThrow({where:{id:"default"}});
  if (!settings.calendarEnabled) return [];
  const entries = await db.marketingCalendarEntry.findMany({where:{status:{in:["approved","started"]}},orderBy:[{date:"asc"},{startTime:"asc"},{id:"asc"}]});
  const runs: string[] = [];
  for (const entry of entries) {
    const existingRun = await db.campaign.findUnique({where:{id:entry.runCampaignId}});
    if (existingRun && ["completed","cancelled"].includes(existingRun.status)) {
      await db.marketingCalendarEntry.update({where:{id:entry.id},data:{status:existingRun.status === "completed" ? "completed":"paused"}});
      continue;
    }
    const disposition = calendarDisposition(entry,true,now);
    if (disposition === "expired") {
      await db.$transaction([
        db.marketingCalendarEntry.update({where:{id:entry.id},data:{status:"skipped",error:"Daily window ended; unused contacts were not carried into another day"}}),
        db.campaign.updateMany({where:{id:entry.runCampaignId,status:{in:["sending","scheduled"]}},data:{status:"paused"}}),
        db.sendJob.updateMany({where:{campaignId:entry.runCampaignId,status:"queued"},data:{status:"skipped",error:"Calendar date/window ended",finishedAt:now}}),
      ]);
      continue;
    }
    if (disposition !== "due") continue;
    try { assertCampaignSendingReady(entry.brandId,entry.channel); } catch (error) {
      await db.marketingCalendarEntry.update({where:{id:entry.id},data:{error:error instanceof Error ? error.message:"Sending is unavailable"}});
      continue;
    }
    const snapshot = entry.snapshot as unknown as CalendarEntry["snapshot"];
    await db.$transaction(async tx => {
      // Re-read approval under a row lock so pausing and creating a run cannot race.
      await tx.$queryRaw`SELECT id FROM "MarketingCalendarEntry" WHERE id = ${entry.id} FOR UPDATE`;
      const current = await tx.marketingCalendarEntry.findUniqueOrThrow({where:{id:entry.id}});
      const enabled = await tx.platformSettings.findUniqueOrThrow({where:{id:"default"}});
      if (calendarDisposition(current,enabled.calendarEnabled,now) !== "due") return;
      await tx.campaign.upsert({where:{id:entry.runCampaignId},update:{},create:{
        id:entry.runCampaignId,brandId:entry.brandId,name:`${entry.product} · ${snapshot.name} · ${entry.date}`,channel:entry.channel,
        subject:snapshot.subject,message:snapshot.message,htmlMessage:snapshot.htmlMessage,imageUrl:snapshot.imageUrl,imageAlt:snapshot.imageAlt,
        sourceFilter:snapshot.sourceFilter,groupFilter:snapshot.groupFilter,preferUnoffered:snapshot.preferUnoffered,preferVerified:snapshot.preferVerified,
        mode:"auto",volume:snapshot.volume,throttlePerHour:snapshot.throttlePerHour,sendWindowPreset:"custom",sendWindowStart:entry.startTime,sendWindowEnd:entry.endTime,timezone:entry.timezone,status:"scheduled",
      }});
      await tx.marketingCalendarEntry.update({where:{id:entry.id},data:{status:"started",error:null}});
      runs.push(entry.runCampaignId);
    });
  }
  return runs;
}
