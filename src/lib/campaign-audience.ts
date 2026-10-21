import { getPrisma } from "@/lib/db";
import { AUDIENCE_NOT_SELECTED, parseAudienceFilter } from "@/lib/audience-filters";

/** Audience changes are allowed only before any provider setup or recipient reservation. */
export async function updateDraftAudience(id: string, sourceFilter: string, groupFilter: string) {
  const db = getPrisma();
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('ig-send-enqueue'))::text`;
    const campaign = await tx.campaign.findUniqueOrThrow({where:{id}});
    if (campaign.status !== "draft" || id.startsWith("camp-calendar-") || campaign.sentCount ||
      await tx.sendJob.count({where:{campaignId:id}}) || await tx.emailCampaignSetup.count({where:{campaignId:id}}))
      throw new Error("Only untouched drafts can change audience. Create a new draft for a campaign that already started.");
    const leads = await tx.lead.findMany({select:{source:true,groupName:true}});
    for (const [value,values,label] of [[sourceFilter,leads.map(l=>l.source),"source"],[groupFilter,leads.map(l=>l.groupName),"group"]] as const) {
      if (value === AUDIENCE_NOT_SELECTED) continue;
      const parsed = parseAudienceFilter(value);
      if (parsed !== "all" && parsed.some(v=>!values.includes(v))) throw new Error(`Choose an existing lead ${label}`);
    }
    return tx.campaign.update({where:{id},data:{sourceFilter,groupFilter}});
  });
}
