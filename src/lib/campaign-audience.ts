import { leadSourceOptions, readManualPackages } from "@/lib/manual-packages";
import { getPrisma } from "@/lib/db";
import { AUDIENCE_NOT_SELECTED, parseAudienceFilter } from "@/lib/audience-filters";

/** Audience changes are allowed only before any provider setup or recipient reservation. */
export async function updateDraftAudience(id: string, sourceFilter: string, groupFilter: string, mode?: "own" | "auto") {
  const db = getPrisma();
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('ig-send-enqueue'))::text`;
    const campaign = await tx.campaign.findUniqueOrThrow({where:{id}});
    if (campaign.status !== "draft" || id.startsWith("camp-calendar-") || campaign.sentCount ||
      await tx.sendJob.count({where:{campaignId:id}}) || await tx.emailCampaignSetup.count({where:{campaignId:id}}))
      throw new Error("Only untouched drafts can change audience. Create a new draft for a campaign that already started.");
    const leads = await tx.lead.findMany({select:{source:true,groupName:true,manualPackages:true}});
    for (const [value,values,label] of [[sourceFilter,leadSourceOptions(leads.map(l=>({...l,manualPackages:readManualPackages(l.manualPackages)}))),"source"],[groupFilter,leads.map(l=>l.groupName),"group"]] as const) {
      if (value === AUDIENCE_NOT_SELECTED) continue;
      const parsed = parseAudienceFilter(value);
      if (parsed !== "all" && parsed.some(v=>!values.includes(v))) throw new Error(`Choose an existing lead ${label}`);
    }
    await tx.$queryRaw`SELECT id FROM "MarketingCalendarEntry" WHERE "campaignId" = ${id} ORDER BY id FOR UPDATE`;
    const waiting = await tx.marketingCalendarEntry.findMany({where:{campaignId:id,brandId:campaign.brandId}});
    if (waiting.some(e=>!["draft","paused"].includes(e.status)) || await tx.campaign.count({where:{id:{in:waiting.map(e=>e.runCampaignId)}}}))
      throw new Error("This calendar plan was already approved or started. Create a new draft to change its audience or run settings.");
    const runMode=mode || campaign.mode;
    {
      for (const entry of waiting.filter(e=>e.status==="draft")) {
        const snapshot = entry.snapshot;
        if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
          await tx.marketingCalendarEntry.updateMany({where:{id:entry.id,status:"draft"},
            data:{snapshot:{...snapshot,sourceFilter,groupFilter,mode:"auto",preferVerified:true,preferUnoffered:false}}});
        }
      }
    }
    return tx.campaign.update({where:{id},data:{sourceFilter,groupFilter,mode:runMode,...(runMode==="auto"?{preferVerified:true,preferUnoffered:false}:{})}});
  });
}
