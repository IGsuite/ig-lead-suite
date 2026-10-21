import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { audienceContactKey } from "@/lib/audience-filters";
import type { Campaign, Lead } from "@/lib/types";

export {calendarOnly} from "@/lib/calendar-audience-client";

/** All dates of the parent plan share recipient history, including uncertain submissions.
 * Uses durable jobs rather than a seven-day event window or a mutable pool cursor.
 * Failed/skipped jobs did not consume a contact. Duplicate CSV rows share an identity.
 */
export async function calendarUsedContacts(db:PrismaClient|Prisma.TransactionClient,campaignId:string,leads:Lead[],channel:Campaign["channel"]) {
  const entry=await db.marketingCalendarEntry.findUnique({where:{runCampaignId:campaignId}});
  if(!entry)return new Set<string>();
  const siblings=await db.marketingCalendarEntry.findMany({where:{campaignId:entry.campaignId},select:{runCampaignId:true}});
  const used=await db.sendJob.findMany({where:{campaignId:{in:siblings.map(e=>e.runCampaignId)},channel,status:{notIn:["failed","skipped"]}},select:{leadId:true,payload:true}});
  const byId=new Map(leads.map(l=>[l.id,l]));
  return new Set(used.flatMap(j=>{
    // Reserve the originally queued address as well if the lead was edited later.
    const payload=j.payload as unknown as {lead?:Lead};
    return [byId.get(j.leadId),payload?.lead].filter((l):l is Lead=>!!l).map(l=>audienceContactKey(l,channel)).filter(Boolean);
  }));
}
