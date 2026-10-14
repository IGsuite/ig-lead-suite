import { timeOfDayBucket } from "@/lib/send-window";
import type {
  CampaignMessageResult,
  CostCategory,
  CostEntry,
  EntityCostRollup,
  EntityImprovementInsight,
  EntityPerformanceScores,
  EntitySourceResult,
  Lead,
  PlatformData,
  Reply,
  TimeOfDayResult,
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

const TOD_LABELS: Record<TimeOfDayResult["bucket"], string> = {
  morning: "Morning (5am–12pm)",
  afternoon: "Afternoon (12–5pm)",
  evening: "Evening (5–9pm)",
  night: "Night (9pm–5am)",
};

/** Which send/reply times of day get the best interested rates. */
export function timeOfDayResults(
  data: PlatformData,
  entityId: string | "all",
  timezone = "America/New_York",
): TimeOfDayResult[] {
  const replies =
    entityId === "all"
      ? data.replies
      : data.replies.filter((r) => r.brandId === entityId);

  const buckets: TimeOfDayResult["bucket"][] = [
    "morning",
    "afternoon",
    "evening",
    "night",
  ];
  const counts = Object.fromEntries(
    buckets.map((b) => [
      b,
      { replies: 0, interested: 0, optOuts: 0 },
    ]),
  ) as Record<
    TimeOfDayResult["bucket"],
    { replies: number; interested: number; optOuts: number }
  >;

  for (const reply of replies) {
    const bucket = timeOfDayBucket(reply.createdAt, timezone);
    counts[bucket].replies += 1;
    if (reply.sentiment === "interested") counts[bucket].interested += 1;
    if (reply.sentiment === "opt_out") counts[bucket].optOuts += 1;
  }

  return buckets.map((bucket) => {
    const c = counts[bucket];
    return {
      bucket,
      label: TOD_LABELS[bucket],
      replies: c.replies,
      interested: c.interested,
      optOuts: c.optOuts,
      interestedRate: c.replies
        ? Math.round((c.interested / c.replies) * 1000) / 10
        : null,
    };
  });
}

function ratePercent(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Scorecards for one entity or the whole pool (`entityId === "all"`). */
export function entityPerformanceScores(
  data: PlatformData,
  entityId: string | "all",
): EntityPerformanceScores {
  if (entityId === "all") {
    const sent = data.campaigns.reduce((s, c) => s + c.sentCount, 0);
    const replies = data.replies.length;
    const interested = data.replies.filter(
      (r) => r.sentiment === "interested",
    ).length;
    const conversions = data.leads.filter(
      (l) => l.status === "converted",
    ).length;
    const optOuts = data.replies.filter((r) => r.sentiment === "opt_out").length;
    const spendCents = (data.costEntries || []).reduce(
      (s, e) => s + e.amountCents,
      0,
    );
    const offered = data.leads.length;
    const denom = sent || offered;
    return {
      brandId: null,
      brandName: "All entities",
      shortName: "All",
      offered,
      sent,
      replies,
      interested,
      conversions,
      optOuts,
      spendCents,
      replyRate: ratePercent(replies, denom),
      interestedRate: ratePercent(interested, replies),
      conversionRate: ratePercent(conversions, offered),
      costPerInterested: interested
        ? Math.round(spendCents / interested)
        : null,
      costEfficiencyScore: null,
    };
  }

  const brand = data.brands.find((b) => b.id === entityId);
  const campaigns = data.campaigns.filter((c) => c.brandId === entityId);
  const sent = campaigns.reduce((s, c) => s + c.sentCount, 0);
  const replies = data.replies.filter((r) => r.brandId === entityId);
  const interested = replies.filter((r) => r.sentiment === "interested").length;
  const optOuts = replies.filter((r) => r.sentiment === "opt_out").length;
  const offered = data.leads.filter((l) =>
    l.offeredEntityIds.includes(entityId),
  ).length;
  const conversions = data.leads.filter(
    (l) => l.convertedEntityId === entityId || (l.status === "converted" && l.lastEntityId === entityId),
  ).length;
  const spendCents = (data.costEntries || [])
    .filter((e) => e.brandId === entityId)
    .reduce((s, e) => s + e.amountCents, 0);
  const denom = sent || offered;

  return {
    brandId: entityId,
    brandName: brand?.name || entityId,
    shortName: brand?.shortName || entityId,
    offered,
    sent,
    replies: replies.length,
    interested,
    conversions,
    optOuts,
    spendCents,
    replyRate: ratePercent(replies.length, denom),
    interestedRate: ratePercent(interested, replies.length),
    conversionRate: ratePercent(conversions, offered || denom),
    costPerInterested: interested
      ? Math.round(spendCents / interested)
      : null,
    costEfficiencyScore: null,
  };
}

/** Scorecards for every entity (+ optional pool row). */
export function allEntityPerformanceScores(
  data: PlatformData,
  includePool = false,
): EntityPerformanceScores[] {
  const rows = data.brands.map((b) => entityPerformanceScores(data, b.id));
  const withCpi = rows.filter((r) => r.costPerInterested != null);
  const min = Math.min(
    ...withCpi.map((r) => r.costPerInterested as number),
    Number.POSITIVE_INFINITY,
  );
  const max = Math.max(
    ...withCpi.map((r) => r.costPerInterested as number),
    0,
  );

  const scored = rows.map((row) => {
    if (row.costPerInterested == null || !withCpi.length) {
      return { ...row, costEfficiencyScore: null };
    }
    if (max === min) return { ...row, costEfficiencyScore: 85 };
    const normalized = 1 - (row.costPerInterested - min) / (max - min);
    return {
      ...row,
      costEfficiencyScore: Math.round(normalized * 1000) / 10,
    };
  });

  if (includePool) {
    return [entityPerformanceScores(data, "all"), ...scored];
  }
  return scored;
}

/**
 * Rank campaign copy by interested rate, then reply rate.
 * Scope with entityId or pass "all".
 */
export function campaignMessageResults(
  data: PlatformData,
  entityId: string | "all",
): CampaignMessageResult[] {
  const campaigns =
    entityId === "all"
      ? data.campaigns
      : data.campaigns.filter((c) => c.brandId === entityId);

  const rows: Omit<CampaignMessageResult, "rank" | "recommendation">[] =
    campaigns.map((campaign) => {
      const brand = data.brands.find((b) => b.id === campaign.brandId);
      const replies = data.replies.filter((r) => r.campaignId === campaign.id);
      const interested = replies.filter(
        (r) => r.sentiment === "interested",
      ).length;
      const optOuts = replies.filter((r) => r.sentiment === "opt_out").length;
      const sent = campaign.sentCount;
      const replyCount = Math.max(campaign.replyCount, replies.length);
      return {
        campaignId: campaign.id,
        brandId: campaign.brandId,
        brandName: brand?.shortName || campaign.brandId,
        name: campaign.name,
        channel: campaign.channel,
        message: campaign.message,
        subject: campaign.subject,
        sent,
        replies: replyCount,
        interested,
        optOuts,
        replyRate: ratePercent(replyCount, sent),
        interestedRate: ratePercent(interested, replyCount || replies.length),
      };
    });

  const ranked = [...rows].sort((a, b) => {
    const ai = a.interestedRate ?? -1;
    const bi = b.interestedRate ?? -1;
    if (bi !== ai) return bi - ai;
    const ar = a.replyRate ?? -1;
    const br = b.replyRate ?? -1;
    if (br !== ar) return br - ar;
    return b.interested - a.interested;
  });

  const withActivity = ranked.filter(
    (r) => r.replies > 0 || r.sent > 0 || r.interested > 0,
  );
  const bestId = withActivity[0]?.campaignId;
  const worstId =
    withActivity.length > 1
      ? withActivity[withActivity.length - 1]?.campaignId
      : undefined;

  return ranked.map((row, index) => ({
    ...row,
    rank: index + 1,
    recommendation:
      row.replies === 0 && row.sent === 0
        ? "hold"
        : row.campaignId === bestId && withActivity.length > 1
          ? "scale_up"
          : row.campaignId === worstId
            ? "cut"
            : "hold",
  }));
}

/** Source + timing + message winners in one scan per entity (or pool). */
export function entityImprovementInsight(
  data: PlatformData,
  entityId: string | "all",
): EntityImprovementInsight {
  const scores = entityPerformanceScores(data, entityId);
  const sources =
    entityId === "all"
      ? poolSourceResults(data)
      : entitySourceResults(data, entityId);
  const withReplies = sources.filter((s) => s.replies > 0);
  const bestSource =
    withReplies.find((s) => s.recommendation === "scale_up") ||
    withReplies[0] ||
    null;
  const worstSource =
    [...withReplies].reverse().find((s) => s.recommendation === "cut") ||
    (withReplies.length > 1 ? withReplies[withReplies.length - 1] : null);

  const timing = timeOfDayResults(data, entityId);
  const bestTiming =
    [...timing]
      .filter((t) => t.replies > 0)
      .sort(
        (a, b) => (b.interestedRate ?? -1) - (a.interestedRate ?? -1),
      )[0] || null;

  const messages = campaignMessageResults(data, entityId);
  const bestMessage =
    messages.find((m) => m.recommendation === "scale_up") ||
    messages.find((m) => m.replies > 0 || m.interested > 0) ||
    null;

  return {
    brandId: entityId === "all" ? null : entityId,
    brandName: scores.brandName,
    bestSource,
    worstSource,
    bestTiming,
    bestMessage,
    scores,
  };
}

export function allEntityImprovementInsights(
  data: PlatformData,
): EntityImprovementInsight[] {
  return data.brands.map((b) => entityImprovementInsight(data, b.id));
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
