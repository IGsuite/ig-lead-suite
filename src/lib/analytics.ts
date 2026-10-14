import type {
  CostCategory,
  CostEntry,
  EntityCostRollup,
  EntitySourceResult,
  Lead,
  PlatformData,
  Reply,
} from "@/lib/types";

export const COST_CATEGORIES: CostCategory[] = [
  "sms",
  "email",
  "leads",
  "setup",
  "integration",
  "other",
];

export function emptyCategoryMap(): Record<CostCategory, number> {
  return {
    sms: 0,
    email: 0,
    leads: 0,
    setup: 0,
    integration: 0,
    other: 0,
  };
}

export function costCategoryLabel(category: CostCategory): string {
  const map: Record<CostCategory, string> = {
    sms: "SMS / texts",
    email: "Email",
    leads: "Lead lists",
    setup: "Setup (10DLC, domains)",
    integration: "Integrations / tools",
    other: "Other",
  };
  return map[category];
}

/** Roll up costs per entity (+ shared overhead row). */
export function entityCostRollups(data: PlatformData): EntityCostRollup[] {
  const entries = data.costEntries || [];
  const brandIds = [
    ...data.brands.map((b) => b.id as string | null),
    null,
  ];

  return brandIds.map((brandId) => {
    const brandName =
      brandId === null
        ? "Shared / overhead"
        : data.brands.find((b) => b.id === brandId)?.name || brandId;
    const byCategory = emptyCategoryMap();
    let totalCents = 0;
    for (const entry of entries) {
      if (entry.brandId !== brandId) continue;
      byCategory[entry.category] += entry.amountCents;
      totalCents += entry.amountCents;
    }

    const replies =
      brandId === null
        ? data.replies.length
        : data.replies.filter((r) => r.brandId === brandId).length;
    const interested =
      brandId === null
        ? data.replies.filter((r) => r.sentiment === "interested").length
        : data.replies.filter(
            (r) => r.brandId === brandId && r.sentiment === "interested",
          ).length;
    const conversions =
      brandId === null
        ? data.leads.filter((l) => l.status === "converted").length
        : data.leads.filter((l) => l.convertedEntityId === brandId).length;

    return {
      brandId,
      brandName,
      byCategory,
      totalCents,
      replies,
      interested,
      conversions,
      costPerReply: replies ? Math.round(totalCents / replies) : null,
      costPerInterested: interested
        ? Math.round(totalCents / interested)
        : null,
    };
  });
}

export function filterCostEntries(
  entries: CostEntry[],
  entityId: string | "all" | "shared",
): CostEntry[] {
  if (entityId === "all") return entries;
  if (entityId === "shared") return entries.filter((e) => e.brandId === null);
  return entries.filter((e) => e.brandId === entityId);
}

export function entitySourceResults(
  data: PlatformData,
  entityId: string,
): EntitySourceResult[] {
  const offered = data.leads.filter((l) =>
    l.offeredEntityIds.includes(entityId),
  );
  const replies = data.replies.filter((r) => r.brandId === entityId);
  const bySource = new Map<
    string,
    {
      offered: Lead[];
      replies: Reply[];
    }
  >();

  for (const lead of offered) {
    const bucket = bySource.get(lead.source) || { offered: [], replies: [] };
    bucket.offered.push(lead);
    bySource.set(lead.source, bucket);
  }
  for (const reply of replies) {
    const lead = data.leads.find((l) => l.id === reply.leadId);
    const source = lead?.source || "Unknown";
    const bucket = bySource.get(source) || { offered: [], replies: [] };
    bucket.replies.push(reply);
    bySource.set(source, bucket);
  }

  const rows: EntitySourceResult[] = [...bySource.entries()].map(
    ([source, bucket]) => {
      const costCents = bucket.offered.reduce((s, l) => s + l.costCents, 0);
      const interested = bucket.replies.filter(
        (r) => r.sentiment === "interested",
      ).length;
      const conversions = bucket.offered.filter(
        (l) => l.convertedEntityId === entityId || l.status === "converted",
      ).length;
      const replyCount = bucket.replies.length;
      return {
        source,
        offered: bucket.offered.length,
        replies: replyCount,
        interested,
        conversions,
        costCents,
        costPerReply: replyCount
          ? Math.round(costCents / replyCount)
          : null,
        recommendation: "hold",
      };
    },
  );

  const ranked = rows
    .filter((r) => r.replies > 0)
    .sort(
      (a, b) =>
        (a.costPerReply ?? Number.POSITIVE_INFINITY) -
        (b.costPerReply ?? Number.POSITIVE_INFINITY),
    );
  const best = ranked[0]?.source;
  const worst = ranked[ranked.length - 1]?.source;

  return rows
    .map((row): EntitySourceResult => ({
      ...row,
      recommendation:
        row.replies === 0
          ? "hold"
          : row.source === best && ranked.length > 1
            ? "scale_up"
            : row.source === worst && ranked.length > 1
              ? "cut"
              : "hold",
    }))
    .sort(
      (a, b) =>
        (a.costPerReply ?? Number.POSITIVE_INFINITY) -
        (b.costPerReply ?? Number.POSITIVE_INFINITY),
    );
}

export function poolSourceResults(data: PlatformData): EntitySourceResult[] {
  const bySource = new Map<string, Lead[]>();
  for (const lead of data.leads) {
    const list = bySource.get(lead.source) || [];
    list.push(lead);
    bySource.set(lead.source, list);
  }

  const rows: EntitySourceResult[] = [...bySource.entries()].map(
    ([source, leads]) => {
      const spend = data.providerSpend.find((p) => p.source === source);
      const costCents = spend?.costCents ?? leads.reduce((s, l) => s + l.costCents, 0);
      const replyLeadIds = new Set(
        data.replies
          .filter((r) => leads.some((l) => l.id === r.leadId))
          .map((r) => r.id),
      );
      const interested = data.replies.filter(
        (r) =>
          leads.some((l) => l.id === r.leadId) && r.sentiment === "interested",
      ).length;
      const conversions =
        spend?.conversions ??
        leads.filter((l) => l.status === "converted").length;
      const replies = spend?.replies ?? replyLeadIds.size;
      return {
        source,
        offered: leads.length,
        replies,
        interested,
        conversions,
        costCents,
        costPerReply: replies ? Math.round(costCents / replies) : null,
        recommendation: "hold" as const,
      };
    },
  );

  const ranked = rows
    .filter((r) => r.replies > 0)
    .sort(
      (a, b) =>
        (a.costPerReply ?? Number.POSITIVE_INFINITY) -
        (b.costPerReply ?? Number.POSITIVE_INFINITY),
    );
  const best = ranked[0]?.source;
  const worst = ranked[ranked.length - 1]?.source;

  return rows
    .map((row): EntitySourceResult => ({
      ...row,
      recommendation:
        row.replies === 0
          ? "hold"
          : row.source === best && ranked.length > 1
            ? "scale_up"
            : row.source === worst && ranked.length > 1
              ? "cut"
              : "hold",
    }))
    .sort(
      (a, b) =>
        (a.costPerReply ?? Number.POSITIVE_INFINITY) -
        (b.costPerReply ?? Number.POSITIVE_INFINITY),
    );
}
