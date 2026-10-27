import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { canAccessEntity, isAdminSession } from "@/lib/acl";
import { getData } from "@/lib/store";
import { getPrisma, isNeonConfigured } from "@/lib/db";
import { campaignListStatus, type CampaignStatusEntry } from "@/lib/campaign-list-status";

export async function GET() {
  const denied = await requireApiSession(); if (denied) return denied;
  const session = await getSession();
  let campaigns: Array<{ id: string; status: string }>;
  let entries: CampaignStatusEntry[] = [], enabled = false;
  const delivery:Record<string,Record<string,number>>={};
  if (isNeonConfigured()) {
    const db = getPrisma();
    const scope = isAdminSession(session) ? {} : { brandId: { in: session?.allowedEntityIds || [] } };
    const [campaignRows, rows, settings] = await Promise.all([
      db.campaign.findMany({ where: scope, select: { id: true, status: true } }),
      db.marketingCalendarEntry.findMany({ where: scope, select: { campaignId:true,runCampaignId:true,date:true,startTime:true,endTime:true,timezone:true,status:true,error:true,snapshot:true } }),
      db.platformSettings.findUnique({ where: { id: "default" }, select: { calendarEnabled: true } }),
    ]);
    campaigns = campaignRows;
    const groups=await db.sendJob.groupBy({by:["campaignId","status"],where:{campaignId:{in:campaignRows.map(c=>c.id)}},_count:true});
    for(const group of groups){delivery[group.campaignId]||={};delivery[group.campaignId][group.status]=group._count;}
    entries = rows.map(e => ({ ...e, snapshot: { volume: typeof e.snapshot === "object" && e.snapshot && "volume" in e.snapshot ? Number(e.snapshot.volume) : 0 } }));
    enabled = settings?.calendarEnabled === true;
  } else campaigns = (await getData({ leadLimit: 0 })).campaigns.filter(c => canAccessEntity(session, c.brandId));
  const runs = new Map(campaigns.map(c => [c.id, c])), now = new Date();
  return NextResponse.json({ statuses: Object.fromEntries(campaigns.map(c => [c.id, campaignListStatus(c, entries, enabled, runs, now)])), delivery, asOf: now.toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
