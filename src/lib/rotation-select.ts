import { createHash } from "crypto";
import { isLeadEligibleForEntity } from "@/lib/eligibility";
import type {
  Campaign,
  CampaignPoolMode,
  Lead,
  LeadSendEvent,
} from "@/lib/types";

/** Same message fingerprint blocked for this many hours (covers “not next day”). */
export const SAME_MESSAGE_COOLDOWN_HOURS = 7 * 24;
/** Auto wheel: don’t re-touch a lead on the same channel within this window. */
export const AUTO_CHANNEL_COOLDOWN_HOURS = 20;

export function messageFingerprint(
  channel: Campaign["channel"],
  message: string,
  subject?: string,
): string {
  const raw = [
    channel,
    (subject || "").trim().toLowerCase(),
    message.trim().toLowerCase().replace(/\s+/g, " "),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 20);
}

function hoursAgo(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

function lastSentAtForLead(
  events: LeadSendEvent[],
  leadId: string,
): string | null {
  let latest: string | null = null;
  for (const e of events) {
    if (e.leadId !== leadId) continue;
    if (!latest || e.sentAt > latest) latest = e.sentAt;
  }
  return latest;
}

export type SelectLeadsInput = {
  leads: Lead[];
  sendEvents: LeadSendEvent[];
  entityId: string;
  channel: Campaign["channel"];
  volume: number;
  mode: CampaignPoolMode;
  messageFingerprint: string;
  sourceFilter: string;
  groupFilter?: string;
  preferVerified?: boolean;
  /** Own campaigns may prefer leads not yet offered this entity. */
  preferUnoffered?: boolean;
  /** Auto wheel cursor into the fair-rotation ordered pool. */
  poolCursor?: number;
  now?: Date;
};

export type SelectLeadsResult = {
  selected: Lead[];
  nextCursor: number;
  eligibleCount: number;
  /** First few lead ids that would be next after this batch (preview). */
  nextUpIds: string[];
};

/**
 * Fair pool selection for Auto wheel and Own campaigns.
 * - Blocks global opt-outs / converted / missing contact (via eligibility).
 * - Never re-sends the same message fingerprint within SAME_MESSAGE_COOLDOWN_HOURS.
 * - Auto mode also skips leads messaged on this channel within AUTO_CHANNEL_COOLDOWN_HOURS
 *   and walks the pool via poolCursor so the same slice is not reused every day.
 */
export function selectLeadsForSend(input: SelectLeadsInput): SelectLeadsResult {
  const now = input.now ?? new Date();
  const preferUnoffered =
    input.mode === "own" ? (input.preferUnoffered ?? true) : false;

  const byLead = new Map<string, LeadSendEvent[]>();
  for (const e of input.sendEvents) {
    const list = byLead.get(e.leadId);
    if (list) list.push(e);
    else byLead.set(e.leadId, [e]);
  }

  const eligible = input.leads.filter((lead) => {
    if (
      !isLeadEligibleForEntity(lead, input.entityId, {
        channel: input.channel,
        sourceFilter: input.sourceFilter,
        groupFilter: input.groupFilter,
        preferUnoffered,
        preferVerified: input.preferVerified ?? true,
      })
    ) {
      return false;
    }

    const events = byLead.get(lead.id) || [];
    for (const e of events) {
      if (
        e.messageFingerprint === input.messageFingerprint &&
        hoursAgo(e.sentAt, now) < SAME_MESSAGE_COOLDOWN_HOURS
      ) {
        return false;
      }
      if (
        input.mode === "auto" &&
        e.channel === input.channel &&
        hoursAgo(e.sentAt, now) < AUTO_CHANNEL_COOLDOWN_HOURS
      ) {
        return false;
      }
    }
    return true;
  });

  // Fair order: least recently contacted first, then fewest entity offers, then id.
  eligible.sort((a, b) => {
    const aLast = lastSentAtForLead(byLead.get(a.id) || [], a.id);
    const bLast = lastSentAtForLead(byLead.get(b.id) || [], b.id);
    if (!aLast && bLast) return -1;
    if (aLast && !bLast) return 1;
    if (aLast && bLast && aLast !== bLast) {
      return aLast < bLast ? -1 : 1;
    }
    const offerDiff = a.offeredEntityIds.length - b.offeredEntityIds.length;
    if (offerDiff !== 0) return offerDiff;
    return a.id.localeCompare(b.id);
  });

  const cursor =
    input.mode === "auto" && eligible.length > 0
      ? Math.abs(input.poolCursor ?? 0) % eligible.length
      : 0;

  const rotated =
    input.mode === "auto" && cursor > 0
      ? [...eligible.slice(cursor), ...eligible.slice(0, cursor)]
      : eligible;

  const volume = Math.max(0, Math.floor(input.volume));
  const selected = rotated.slice(0, volume);
  const nextCursor =
    input.mode === "auto" && eligible.length > 0
      ? (cursor + selected.length) % eligible.length
      : input.poolCursor ?? 0;
  const nextUpIds = rotated
    .slice(selected.length, selected.length + 5)
    .map((l) => l.id);

  return {
    selected,
    nextCursor,
    eligibleCount: eligible.length,
    nextUpIds,
  };
}

export function buildSendEvents(input: {
  leads: Lead[];
  entityId: string;
  campaignId: string;
  channel: Campaign["channel"];
  messageFingerprint: string;
  mode: CampaignPoolMode;
  sentAt?: string;
}): LeadSendEvent[] {
  const sentAt = input.sentAt ?? new Date().toISOString();
  return input.leads.map((lead, i) => ({
    id: `send-${input.campaignId}-${lead.id}-${i}`,
    leadId: lead.id,
    entityId: input.entityId,
    campaignId: input.campaignId,
    channel: input.channel,
    messageFingerprint: input.messageFingerprint,
    mode: input.mode,
    sentAt,
  }));
}

export function wheelVisibility(input: {
  brands: Array<{ id: string; shortName: string }>;
  rotation: {
    entityOrder: string[];
    quotas: Array<{
      entityId: string;
      enabled: boolean;
      dailyEmailVolume: number;
      dailySmsVolume: number;
    }>;
    lastRunAt?: string;
    nextRunAt?: string;
    poolCursor?: number;
  };
  sendEvents: LeadSendEvent[];
  leads: Lead[];
}): {
  order: Array<{
    entityId: string;
    shortName: string;
    enabled: boolean;
    dailyEmailVolume: number;
    dailySmsVolume: number;
    lastSentAt: string | null;
    lastSentCount: number;
  }>;
  nextUpLeads: Array<{ id: string; name: string; email?: string; phone?: string }>;
  poolCursor: number;
} {
  const lastByEntity = new Map<
    string,
    { at: string; count: number }
  >();
  for (const e of input.sendEvents) {
    if (e.mode !== "auto") continue;
    const prev = lastByEntity.get(e.entityId);
    if (!prev || e.sentAt > prev.at) {
      lastByEntity.set(e.entityId, { at: e.sentAt, count: 1 });
    } else if (e.sentAt === prev.at) {
      prev.count += 1;
    }
  }

  // Approximate “next up” from least-recently-sent leads not opted out.
  const nextUpLeads = [...input.leads]
    .filter((l) => !l.optedOut && l.status !== "opted_out" && l.status !== "converted")
    .sort((a, b) => {
      const aEvents = input.sendEvents.filter((e) => e.leadId === a.id);
      const bEvents = input.sendEvents.filter((e) => e.leadId === b.id);
      const aLast = aEvents.reduce(
        (m, e) => (!m || e.sentAt > m ? e.sentAt : m),
        null as string | null,
      );
      const bLast = bEvents.reduce(
        (m, e) => (!m || e.sentAt > m ? e.sentAt : m),
        null as string | null,
      );
      if (!aLast && bLast) return -1;
      if (aLast && !bLast) return 1;
      if (aLast && bLast && aLast !== bLast) return aLast < bLast ? -1 : 1;
      return a.id.localeCompare(b.id);
    })
    .slice(0, 8)
    .map((l) => ({
      id: l.id,
      name:
        [l.firstName, l.lastName].filter(Boolean).join(" ") ||
        l.email ||
        l.phone ||
        l.id,
      email: l.email,
      phone: l.phone,
    }));

  const order = input.rotation.entityOrder.map((entityId) => {
    const brand = input.brands.find((b) => b.id === entityId);
    const quota = input.rotation.quotas.find((q) => q.entityId === entityId);
    const last = lastByEntity.get(entityId);
    return {
      entityId,
      shortName: brand?.shortName || entityId,
      enabled: quota?.enabled ?? false,
      dailyEmailVolume: quota?.dailyEmailVolume ?? 0,
      dailySmsVolume: quota?.dailySmsVolume ?? 0,
      lastSentAt: last?.at ?? null,
      lastSentCount: last?.count ?? 0,
    };
  });

  return {
    order,
    nextUpLeads,
    poolCursor: input.rotation.poolCursor ?? 0,
  };
}
