export const campaignStatusFilters = ["all", "active", "pending", "inactive", "completed", "cancelled"] as const;
export type CampaignStatusFilter = typeof campaignStatusFilters[number];
export type CampaignListStatus = { group: Exclude<CampaignStatusFilter, "all">; status: string; detail?: string };
