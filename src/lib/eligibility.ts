import { matchesAudienceFilter } from "@/lib/audience-filters";
import { matchesLeadSource } from "@/lib/manual-packages";
import type { Campaign, Lead } from "@/lib/types";
import { contactOkForChannel } from "@/lib/verify";
import { hasSmsMarketingConsent } from "@/lib/sms-consent";

export function normalizeContact(value?: string): string {
  return (value || "").trim().toLowerCase().replace(/[\s()-]/g, "");
}

export function isLeadEligibleForEntity(
  lead: Lead,
  entityId: string,
  options: {
    channel: Campaign["channel"];
    sourceFilter: string;
    groupFilter?: string;
    preferUnoffered: boolean;
    preferVerified?: boolean;
  },
): boolean {
  if (lead.optedOut || lead.status === "opted_out") return false;
  if (lead.status === "converted" || lead.convertedEntityId) return false;
  if (!matchesLeadSource(lead, options.sourceFilter)) return false;
  if (!matchesAudienceFilter(lead.groupName, options.groupFilter || "all"))
    return false;
  if (options.channel === "sms" && !lead.phone) return false;
  if (options.channel === "sms" && !hasSmsMarketingConsent(lead, entityId)) return false;
  if (options.channel === "email" && !lead.email) return false;
  if (options.preferUnoffered && lead.offeredEntityIds.includes(entityId))
    return false;
  if (
    !contactOkForChannel(lead, options.channel, options.preferVerified ?? true)
  )
    return false;
  return true;
}
