import type { Campaign, Lead } from "@/lib/types";

export function normalizeContact(value?: string): string {
  return (value || "").trim().toLowerCase().replace(/[\s()-]/g, "");
}

export function isLeadEligibleForEntity(
  lead: Lead,
  entityId: string,
  options: {
    channel: Campaign["channel"];
    sourceFilter: string;
    preferUnoffered: boolean;
  },
): boolean {
  if (lead.optedOut || lead.status === "opted_out") return false;
  if (lead.status === "converted" || lead.convertedEntityId) return false;
  if (options.sourceFilter !== "all" && lead.source !== options.sourceFilter)
    return false;
  if (options.channel === "sms" && !lead.phone) return false;
  if (options.channel === "email" && !lead.email) return false;
  if (options.preferUnoffered && lead.offeredEntityIds.includes(entityId))
    return false;
  return true;
}
