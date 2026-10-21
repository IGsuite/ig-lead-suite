import { timeOfDayBucket } from "@/lib/send-window";
import type {
  CampaignChannel,
  CampaignMessageResult,
  ChannelFilter,
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

export const CHANNEL_FILTERS: ChannelFilter[] = ["sms", "email", "all"];

export function channelLabel(channel: ChannelFilter): string {
  if (channel === "all") return "All channels";
  if (channel === "sms") return "SMS";
  return "Email";
}

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

function matchesChannel(
  value: CampaignChannel,
  channel: ChannelFilter,
): boolean {
  return channel === "all" || value === channel;
}

function filterReplies(
  replies: Reply[],
  channel: ChannelFilter,
): Reply[] {
  if (channel === "all") return replies;
  return replies.filter((r) => r.channel === channel);
}

function filterCampaignsByChannel<T extends { channel: CampaignChannel }>(
  campaigns: T[],
  channel: ChannelFilter,
): T[] {
  if (channel === "all") return campaigns;
  return campaigns.filter((c) => c.channel === channel);
}

function spendForScope(
  entries: CostEntry[],
  brandId: string | null | "all",
  channel: ChannelFilter,
): number {
  return entries
    .filter((e) => {
      if (brandId !== "all" && e.brandId !== brandId) return false;
      if (channel === "sms") return e.category === "sms";
      if (channel === "email") return e.category === "email";
      return true;
    })
    .reduce((s, e) => s + e.amountCents, 0);
}

function leadChannelCapable(lead: Lead, channel: ChannelFilter): boolean {
  if (channel === "sms") return Boolean(lead.phone);
  if (channel === "email") return Boolean(lead.email);
  return Boolean(lead.phone || lead.email);
}

function convertedForEntity(
  lead: Lead,
  entityId: string,
): boolean {
  return (
    lead.convertedEntityId === entityId ||
    (lead.status === "converted" && lead.lastEntityId === entityId)
  );
}

function channelAttributedConversions(
  data: PlatformData,
  entityId: string | "all",
  channel: ChannelFilter,
): number {
  if(data.leadSummary)return data.leadSummary.rollups.filter(r=>r.brandId===entityId&&r.channel===channel).reduce((n,r)=>n+r.conversions,0);
  if (entityId === "all") {
    if (channel === "all") {
      return data.leads.filter((l) => l.status === "converted").length;
    }
    const convertedIds = new Set(
      data.leads.filter((l) => l.status === "converted").map((l) => l.id),
    );
    return data.leads.filter((l) => {
      if (!convertedIds.has(l.id)) return false;
      return data.replies.some(
        (r) => r.leadId === l.id && r.channel === channel,
      );
    }).length;
  }

  return data.leads.filter((l) => {
    if (!convertedForEntity(l, entityId)) return false;
    if (channel === "all") return true;
    return data.replies.some(
      (r) =>
        r.leadId === l.id &&
        r.brandId === entityId &&
        r.channel === channel,
    );
  }).length;
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
    const conversions = data.leadSummary ? (brandId===null ? channelAttributedConversions(data,"all","all") : data.leadSummary.byBrand[brandId]?.conversions||0) :
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

function buildSourceRows(
  sources: Map<
    string,
    {
      offered: Lead[];
      replies: Reply[];
    }
  >,
  channel: ChannelFilter,
  costResolver: (leads: Lead[], source: string) => number,
  conversionResolver: (leads: Lead[], source: string) => number,
): EntitySourceResult[] {
  const rows: EntitySourceResult[] = [...sources.entries()].map(
    ([source, bucket]) => {
      const scopedReplies = filterReplies(bucket.replies, channel);
      const costCents = costResolver(bucket.offered, source);
      const interested = scopedReplies.filter(
        (r) => r.sentiment === "interested",
      ).length;
      const conversions = conversionResolver(bucket.offered, source);
      const replyCount = scopedReplies.length;
      const smsReplies = bucket.replies.filter((r) => r.channel === "sms").length;
      const emailReplies = bucket.replies.filter(
        (r) => r.channel === "email",
      ).length;
      return {
        source,
        offered: bucket.offered.length,
        phoneCapable: bucket.offered.filter((l) => Boolean(l.phone)).length,
        emailCapable: bucket.offered.filter((l) => Boolean(l.email)).length,
        replies: replyCount,
        smsReplies,
        emailReplies,
        interested,
        conversions,
        costCents,
        costPerReply: replyCount
          ? Math.round(costCents / replyCount)
          : null,
        recommendation: "hold" as const,
        channel,
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

function sourceRowsFromRollups(data:PlatformData,brandId:string,channel:ChannelFilter):EntitySourceResult[]{
  const sourceByLead=new Map(data.leads.map(l=>[l.id,l.source]));
  const rollups=data.leadSummary!.rollups.filter(r=>r.brandId===brandId&&r.channel===channel);
  const sources=new Set([...rollups.map(r=>r.source),...data.replies.filter(r=>brandId==="all"||r.brandId===brandId).map(r=>sourceByLead.get(r.leadId)||"Unknown")]);
  const rows:EntitySourceResult[]=[...sources].map(source=>{
    const rollup=rollups.find(r=>r.source===source);
    const replies=data.replies.filter(r=>(brandId==="all"||r.brandId===brandId)&&(sourceByLead.get(r.leadId)||"Unknown")===source);
    const scoped=filterReplies(replies,channel),spend=brandId==="all"?data.providerSpend.find(p=>p.source===source):undefined;
    const costCents=spend?.costCents??rollup?.costCents??0;
    return {source,offered:rollup?.offered||0,phoneCapable:rollup?.phoneCapable||0,emailCapable:rollup?.emailCapable||0,
      replies:scoped.length,smsReplies:replies.filter(r=>r.channel==="sms").length,emailReplies:replies.filter(r=>r.channel==="email").length,
      interested:scoped.filter(r=>r.sentiment==="interested").length,conversions:channel==="all"&&spend?spend.conversions:rollup?.conversions||0,
      costCents,costPerReply:scoped.length?Math.round(costCents/scoped.length):null,recommendation:"hold",channel};
  });
  const ranked=rows.filter(r=>r.replies>0).sort((a,b)=>(a.costPerReply??Infinity)-(b.costPerReply??Infinity));
  return rows.map(r=>({...r,recommendation:ranked.length>1&&r.source===ranked[0].source?"scale_up" as const:ranked.length>1&&r.source===ranked.at(-1)!.source?"cut" as const:"hold" as const})).sort((a,b)=>(a.costPerReply??Infinity)-(b.costPerReply??Infinity));
}

export function entitySourceResults(
  data: PlatformData,
  entityId: string,
  channel: ChannelFilter = "all",
): EntitySourceResult[] {
  if(data.leadSummary)return sourceRowsFromRollups(data,entityId,channel);
  const offered = data.leads.filter(
    (l) =>
      l.offeredEntityIds.includes(entityId) &&
      leadChannelCapable(l, channel === "all" ? "all" : channel),
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

  return buildSourceRows(
    bySource,
    channel,
    (leads) => leads.reduce((s, l) => s + l.costCents, 0),
    (leads) =>
      leads.filter((l) => {
        if (!convertedForEntity(l, entityId) && l.status !== "converted") {
          return false;
        }
        if (channel === "all") {
          return (
            l.convertedEntityId === entityId || l.status === "converted"
          );
        }
        return data.replies.some(
          (r) =>
            r.leadId === l.id &&
            r.brandId === entityId &&
            r.channel === channel,
        );
      }).length,
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
  channel: ChannelFilter = "all",
): TimeOfDayResult[] {
  const replies = filterReplies(
    entityId === "all"
      ? data.replies
      : data.replies.filter((r) => r.brandId === entityId),
    channel,
  );

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
  channel: ChannelFilter = "all",
): EntityPerformanceScores {
  if (entityId === "all") {
    const campaigns = filterCampaignsByChannel(data.campaigns, channel);
    const sent = campaigns.reduce((s, c) => s + c.sentCount, 0);
    const replies = filterReplies(data.replies, channel);
    const interested = replies.filter(
      (r) => r.sentiment === "interested",
    ).length;
    const conversions = channelAttributedConversions(data, "all", channel);
    const optOuts = replies.filter((r) => r.sentiment === "opt_out").length;
    const spendCents = spendForScope(
      data.costEntries || [],
      "all",
      channel,
    );
    const offered = data.leadSummary ? data.leadSummary.rollups.filter(r=>r.brandId==="all"&&r.channel===channel).reduce((n,r)=>n+r.offered,0) : data.leads.filter((l) =>
      leadChannelCapable(l, channel),
    ).length;
    const denom = sent || offered;
    return {
      brandId: null,
      brandName: "All entities",
      shortName: "All",
      channel,
      offered,
      sent,
      replies: replies.length,
      interested,
      conversions,
      optOuts,
      spendCents,
      replyRate: ratePercent(replies.length, denom),
      interestedRate: ratePercent(interested, replies.length),
      conversionRate: ratePercent(conversions, offered),
      costPerInterested: interested
        ? Math.round(spendCents / interested)
        : null,
      costEfficiencyScore: null,
    };
  }

  const brand = data.brands.find((b) => b.id === entityId);
  const campaigns = filterCampaignsByChannel(
    data.campaigns.filter((c) => c.brandId === entityId),
    channel,
  );
  const sent = campaigns.reduce((s, c) => s + c.sentCount, 0);
  const replies = filterReplies(
    data.replies.filter((r) => r.brandId === entityId),
    channel,
  );
  const interested = replies.filter((r) => r.sentiment === "interested").length;
  const optOuts = replies.filter((r) => r.sentiment === "opt_out").length;
  const offered = data.leadSummary ? data.leadSummary.rollups.filter(r=>r.brandId===entityId&&r.channel===channel).reduce((n,r)=>n+r.offered,0) : data.leads.filter(
    (l) =>
      l.offeredEntityIds.includes(entityId) &&
      leadChannelCapable(l, channel),
  ).length;
  const conversions = channelAttributedConversions(data, entityId, channel);
  const spendCents = spendForScope(
    data.costEntries || [],
    entityId,
    channel,
  );
  const denom = sent || offered;

  return {
    brandId: entityId,
    brandName: brand?.name || entityId,
    shortName: brand?.shortName || entityId,
    channel,
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

function attachEfficiencyScores(
  rows: EntityPerformanceScores[],
): EntityPerformanceScores[] {
  const withCpi = rows.filter((r) => r.costPerInterested != null);
  const min = Math.min(
    ...withCpi.map((r) => r.costPerInterested as number),
    Number.POSITIVE_INFINITY,
  );
  const max = Math.max(
    ...withCpi.map((r) => r.costPerInterested as number),
    0,
  );

  return rows.map((row) => {
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
}

/** Scorecards for every entity (+ optional pool row). */
export function allEntityPerformanceScores(
  data: PlatformData,
  includePool = false,
  channel: ChannelFilter = "all",
): EntityPerformanceScores[] {
  const rows = data.brands.map((b) =>
    entityPerformanceScores(data, b.id, channel),
  );
  const scored = attachEfficiencyScores(rows);

  if (includePool) {
    return [entityPerformanceScores(data, "all", channel), ...scored];
  }
  return scored;
}

/**
 * Rank campaign copy by interested rate, then reply rate.
 * Scope with entityId or pass "all". Always pass a channel to avoid
 * ranking SMS and email copy in one pile.
 */
export function campaignMessageResults(
  data: PlatformData,
  entityId: string | "all",
  channel: ChannelFilter = "all",
): CampaignMessageResult[] {
  const campaigns = filterCampaignsByChannel(
    entityId === "all"
      ? data.campaigns
      : data.campaigns.filter((c) => c.brandId === entityId),
    channel,
  );

  const rows: Omit<CampaignMessageResult, "rank" | "recommendation">[] =
    campaigns.map((campaign) => {
      const brand = data.brands.find((b) => b.id === campaign.brandId);
      const replies = data.replies.filter(
        (r) =>
          r.campaignId === campaign.id &&
          matchesChannel(r.channel, channel),
      );
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
  channel: ChannelFilter = "all",
): EntityImprovementInsight {
  const scores = entityPerformanceScores(data, entityId, channel);
  const sources =
    entityId === "all"
      ? poolSourceResults(data, channel)
      : entitySourceResults(data, entityId, channel);
  const withReplies = sources.filter((s) => s.replies > 0);
  const bestSource =
    withReplies.find((s) => s.recommendation === "scale_up") ||
    withReplies[0] ||
    null;
  const worstSource =
    [...withReplies].reverse().find((s) => s.recommendation === "cut") ||
    (withReplies.length > 1 ? withReplies[withReplies.length - 1] : null);

  const timing = timeOfDayResults(data, entityId, "America/New_York", channel);
  const bestTiming =
    [...timing]
      .filter((t) => t.replies > 0)
      .sort(
        (a, b) => (b.interestedRate ?? -1) - (a.interestedRate ?? -1),
      )[0] || null;

  const messages = campaignMessageResults(data, entityId, channel);
  const bestMessage =
    messages.find((m) => m.recommendation === "scale_up") ||
    messages.find((m) => m.replies > 0 || m.interested > 0) ||
    null;

  return {
    brandId: entityId === "all" ? null : entityId,
    brandName: scores.brandName,
    channel,
    bestSource,
    worstSource,
    bestTiming,
    bestMessage,
    scores,
  };
}

export function allEntityImprovementInsights(
  data: PlatformData,
  channel: ChannelFilter = "all",
): EntityImprovementInsight[] {
  return data.brands.map((b) =>
    entityImprovementInsight(data, b.id, channel),
  );
}

export function poolSourceResults(
  data: PlatformData,
  channel: ChannelFilter = "all",
): EntitySourceResult[] {
  if(data.leadSummary)return sourceRowsFromRollups(data,"all",channel);
  const bySource = new Map<string, Lead[]>();
  for (const lead of data.leads) {
    if (!leadChannelCapable(lead, channel)) continue;
    const list = bySource.get(lead.source) || [];
    list.push(lead);
    bySource.set(lead.source, list);
  }

  const sources = new Map<
    string,
    {
      offered: Lead[];
      replies: Reply[];
    }
  >();

  for (const [source, leads] of bySource.entries()) {
    sources.set(source, {
      offered: leads,
      replies: data.replies.filter((r) =>
        leads.some((l) => l.id === r.leadId),
      ),
    });
  }

  return buildSourceRows(
    sources,
    channel,
    (leads, source) => {
      const spend = data.providerSpend.find((p) => p.source === source);
      return spend?.costCents ?? leads.reduce((s, l) => s + l.costCents, 0);
    },
    (leads, source) => {
      const spend = data.providerSpend.find((p) => p.source === source);
      if (channel === "all" && spend?.conversions != null) {
        return spend.conversions;
      }
      return leads.filter((l) => {
        if (l.status !== "converted") return false;
        if (channel === "all") return true;
        return data.replies.some(
          (r) => r.leadId === l.id && r.channel === channel,
        );
      }).length;
    },
  );
}
