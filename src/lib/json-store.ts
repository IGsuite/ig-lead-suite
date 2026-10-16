import { promises as fs } from "fs";
import path from "path";
import {
  entityOfferCopy,
  normalizeRotation,
  tomorrowIso,
  type AutopilotRunResult,
} from "@/lib/autopilot";

export type { AutopilotRunResult };
import { normalizeContact } from "@/lib/eligibility";
import { deleteAdAssetFile } from "@/lib/ad-assets-fs";
import { normalizeSocialLinks } from "@/lib/mappers";
import {
  STORE_VERSION,
  createSeedData,
  materializeSeedAdAssets,
} from "@/lib/seed";
import {
  buildSendEvents,
  messageFingerprint,
  selectLeadsForSend,
} from "@/lib/rotation-select";
import type {
  AdAsset,
  AdFolder,
  Brand,
  Campaign,
  CostEntry,
  Lead,
  MessageTemplate,
  OptOut,
  PlatformData,
  Reply,
  RotationConfig,
  SocialCampaign,
  SocialConnection,
  UploadBatch,
} from "@/lib/types";
import { deliverCampaignBatch } from "@/lib/send";
import {
  isWithinSendWindow,
  normalizeSendWindow,
  sendWindowLabel,
} from "@/lib/send-window";
import { applyVerification } from "@/lib/verify";

export type LaunchResult = {
  campaign: Campaign;
  deferred: boolean;
  reason?: string;
  windowLabel?: string;
};

import { ensureStore, writeStore } from "@/lib/json-store-io";

export async function getData(): Promise<PlatformData> {
  return ensureStore();
}

export async function resetData(): Promise<PlatformData> {
  const seed = await materializeSeedAdAssets(createSeedData());
  await writeStore(seed);
  return seed;
}

export async function updateBrand(
  id: string,
  patch: Partial<Brand>,
): Promise<Brand | null> {
  const data = await ensureStore();
  const idx = data.brands.findIndex((b) => b.id === id);
  if (idx < 0) return null;
  data.brands[idx] = { ...data.brands[idx], ...patch, id };
  await writeStore(data);
  return data.brands[idx];
}

export async function updateRotation(
  patch: Partial<RotationConfig>,
): Promise<RotationConfig> {
  const data = await ensureStore();
  data.rotation = normalizeRotation(
    { ...data.rotation, ...patch },
    data.brands,
  );
  await writeStore(data);
  return data.rotation;
}

export async function importLeads(input: {
  filename: string;
  source: string;
  groupName?: string;
  purchaseDate: string;
  costCents: number;
  rows: Array<{
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    businessName?: string;
    source?: string;
    groupName?: string;
  }>;
}): Promise<{ batch: UploadBatch; imported: Lead[]; duplicates: number }> {
  const defaultGroup = input.groupName?.trim() || "General";
  const data = await ensureStore();
  const existingKeys = new Set<string>();
  for (const lead of data.leads) {
    if (lead.email) existingKeys.add(`e:${normalizeContact(lead.email)}`);
    if (lead.phone) existingKeys.add(`p:${normalizeContact(lead.phone)}`);
  }
  for (const opt of data.optOuts) {
    existingKeys.add(`o:${normalizeContact(opt.contact)}`);
  }

  const imported: Lead[] = [];
  let duplicates = 0;
  const batchId = `upload-${Date.now()}`;
  const costPerLead =
    input.rows.length > 0
      ? Math.round(input.costCents / input.rows.length)
      : 0;

  for (let idx = 0; idx < input.rows.length; idx += 1) {
    const row = input.rows[idx];
    const emailKey = row.email ? `e:${normalizeContact(row.email)}` : null;
    const phoneKey = row.phone ? `p:${normalizeContact(row.phone)}` : null;
    const optedKeyEmail = row.email
      ? `o:${normalizeContact(row.email)}`
      : null;
    const optedKeyPhone = row.phone
      ? `o:${normalizeContact(row.phone)}`
      : null;

    if (
      (emailKey && existingKeys.has(emailKey)) ||
      (phoneKey && existingKeys.has(phoneKey)) ||
      (optedKeyEmail && existingKeys.has(optedKeyEmail)) ||
      (optedKeyPhone && existingKeys.has(optedKeyPhone))
    ) {
      duplicates += 1;
      continue;
    }

    if (!row.email && !row.phone) {
      continue;
    }

    const lead = applyVerification({
      id: `${batchId}-${imported.length}-${idx}`,
      email: row.email?.trim() || undefined,
      phone: row.phone?.trim() || undefined,
      firstName: row.firstName?.trim() || undefined,
      lastName: row.lastName?.trim() || undefined,
      businessName: row.businessName?.trim() || undefined,
      source: row.source?.trim() || input.source,
      groupName: row.groupName?.trim() || defaultGroup,
      purchaseDate: input.purchaseDate,
      costCents: costPerLead,
      offeredEntityIds: [],
      lastEntityId: null,
      convertedEntityId: null,
      status: "available",
      optedOut: false,
      emailStatus: "unverified",
      phoneStatus: "unverified",
      uploadBatchId: batchId,
      createdAt: new Date().toISOString(),
    });
    imported.push(lead);
    if (emailKey) existingKeys.add(emailKey);
    if (phoneKey) existingKeys.add(phoneKey);
  }

  const batch: UploadBatch = {
    id: batchId,
    filename: input.filename,
    source: input.source,
    groupName: defaultGroup,
    purchaseDate: input.purchaseDate,
    costCents: input.costCents,
    rowCount: input.rows.length,
    duplicateCount: duplicates,
    importedCount: imported.length,
    createdAt: new Date().toISOString(),
  };

  data.uploads.unshift(batch);
  data.leads.unshift(...imported);

  const spend = data.providerSpend.find((p) => p.source === input.source);
  if (spend) {
    spend.leadsPurchased += imported.length;
    spend.costCents += input.costCents;
  } else {
    data.providerSpend.push({
      source: input.source,
      leadsPurchased: imported.length,
      costCents: input.costCents,
      replies: 0,
      conversions: 0,
    });
  }

  await writeStore(data);
  return { batch, imported, duplicates };
}

export async function createCampaign(
  input: Omit<
    Campaign,
    | "id"
    | "sentCount"
    | "replyCount"
    | "optOutCount"
    | "bounceCount"
    | "createdAt"
    | "startedAt"
  >,
): Promise<Campaign> {
  const data = await ensureStore();
  const win = normalizeSendWindow(input);
  const campaign: Campaign = {
    ...input,
    ...win,
    mode: input.mode || "own",
    id: `camp-${Date.now()}`,
    sentCount: 0,
    replyCount: 0,
    optOutCount: 0,
    bounceCount: 0,
    createdAt: new Date().toISOString(),
  };
  data.campaigns.unshift(campaign);
  await writeStore(data);
  return campaign;
}

export async function launchCampaign(id: string): Promise<LaunchResult | null> {
  const data = await ensureStore();
  const campaign = data.campaigns.find((c) => c.id === id);
  if (!campaign) return null;

  // Backfill window fields for older local JSON rows
  if (!campaign.sendWindowPreset) {
    Object.assign(campaign, normalizeSendWindow(campaign));
  }

  if (!isWithinSendWindow(campaign)) {
    campaign.status = "scheduled";
    await writeStore(data);
    return {
      campaign,
      deferred: true,
      reason: "outside_send_window",
      windowLabel: sendWindowLabel(campaign),
    };
  }

  if (!campaign.mode) {
    campaign.mode =
      campaign.name?.startsWith("Autopilot ·") ||
      campaign.id?.startsWith("camp-auto-")
        ? "auto"
        : "own";
  }

  const fingerprint = messageFingerprint(
    campaign.channel,
    campaign.message,
    campaign.subject,
  );
  const pick = selectLeadsForSend({
    leads: data.leads,
    sendEvents: data.sendEvents || [],
    entityId: campaign.brandId,
    channel: campaign.channel,
    volume: campaign.volume,
    mode: campaign.mode,
    messageFingerprint: fingerprint,
    sourceFilter: campaign.sourceFilter,
    groupFilter: campaign.groupFilter,
    preferVerified: campaign.preferVerified,
    preferUnoffered: campaign.preferUnoffered,
    poolCursor: data.rotation?.poolCursor ?? 0,
  });
  const toSend = pick.selected;
  const brand = data.brands.find((b) => b.id === campaign.brandId);
  if (brand && toSend.length) {
    await deliverCampaignBatch({ campaign, brand, leads: toSend });
  }

  for (const lead of toSend) {
    if (!lead.offeredEntityIds.includes(campaign.brandId)) {
      lead.offeredEntityIds.push(campaign.brandId);
    }
    lead.lastEntityId = campaign.brandId;
    lead.status = "contacted";
  }

  const events = buildSendEvents({
    leads: toSend,
    entityId: campaign.brandId,
    campaignId: campaign.id,
    channel: campaign.channel,
    messageFingerprint: fingerprint,
    mode: campaign.mode,
  });
  data.sendEvents = [...events, ...(data.sendEvents || [])].slice(0, 50_000);

  if (campaign.mode === "auto" && data.rotation) {
    data.rotation = {
      ...data.rotation,
      poolCursor: pick.nextCursor,
    };
  }

  campaign.status = "sending";
  campaign.sentCount = toSend.length;
  campaign.startedAt = new Date().toISOString();
  await writeStore(data);
  return { campaign, deferred: false };
}

export async function applyOptOut(input: {
  contact: string;
  channel: OptOut["channel"];
  reason: string;
  brandId?: string | null;
}): Promise<OptOut> {
  const data = await ensureStore();
  const normalized = normalizeContact(input.contact);
  const opt: OptOut = {
    id: `opt-${Date.now()}`,
    contact: input.contact,
    channel: input.channel,
    reason: input.reason,
    brandId: input.brandId ?? null,
    createdAt: new Date().toISOString(),
  };
  data.optOuts.unshift(opt);

  for (const lead of data.leads) {
    const emailMatch =
      lead.email && normalizeContact(lead.email) === normalized;
    const phoneMatch =
      lead.phone && normalizeContact(lead.phone) === normalized;
    if (emailMatch || phoneMatch) {
      lead.optedOut = true;
      lead.status = "opted_out";
    }
  }

  await writeStore(data);
  return opt;
}

export async function markReply(
  id: string,
  patch: Partial<
    Pick<Reply, "read" | "crmSynced" | "sentiment" | "manualForwarded">
  >,
): Promise<Reply | null> {
  const data = await ensureStore();
  const reply = data.replies.find((r) => r.id === id);
  if (!reply) return null;
  Object.assign(reply, patch);

  if (patch.sentiment === "interested" || reply.sentiment === "interested") {
    const lead = data.leads.find((l) => l.id === reply.leadId);
    if (lead) lead.status = "replied";
  }
  if (patch.sentiment === "opt_out") {
    const lead = data.leads.find((l) => l.id === reply.leadId);
    if (lead) {
      lead.optedOut = true;
      lead.status = "opted_out";
    }
  }

  await writeStore(data);
  return reply;
}

function guessSentiment(body: string): Reply["sentiment"] {
  const t = body.toLowerCase();
  if (/\bstop\b|\bunsubscribe\b|\bopt.?out\b/.test(t)) return "opt_out";
  if (/\byes\b|\binterested\b|\bcall me\b|\bsend (me )?rates\b|\binfo\b/.test(t))
    return "interested";
  if (/\bno\b|\bnot interested\b|\balready funded\b/.test(t))
    return "not_interested";
  if (/\bwho is this\b|\?\s*$/.test(t)) return "neutral";
  return "other";
}

/** Ingest an inbound SMS/email reply into the correct entity inbox. */
export async function ingestReply(input: {
  channel: Reply["channel"];
  from: string;
  body: string;
  brandId?: string;
  campaignId?: string;
  leadId?: string;
}): Promise<Reply> {
  const data = await ensureStore();
  const fromNorm = normalizeContact(input.from);

  let lead =
    (input.leadId && data.leads.find((l) => l.id === input.leadId)) ||
    data.leads.find(
      (l) =>
        (l.phone && normalizeContact(l.phone) === fromNorm) ||
        (l.email && normalizeContact(l.email) === fromNorm),
    );

  let brandId = input.brandId;
  let campaignId = input.campaignId;

  if (!brandId && lead?.lastEntityId) brandId = lead.lastEntityId;
  if (!brandId && lead?.offeredEntityIds.length) {
    brandId = lead.offeredEntityIds[lead.offeredEntityIds.length - 1];
  }
  // Ignore external ids (e.g. Smartlead campaign_id) that are not ours
  if (campaignId && !data.campaigns.some((c) => c.id === campaignId)) {
    campaignId = undefined;
  }
  if (!campaignId && brandId) {
    const camp = data.campaigns.find(
      (c) =>
        c.brandId === brandId &&
        c.channel === input.channel &&
        (c.status === "sending" || c.status === "completed"),
    );
    campaignId = camp?.id;
  }
  if (!brandId) brandId = data.brands[0]?.id || "abstract";
  if (!campaignId) {
    const camp = data.campaigns.find((c) => c.brandId === brandId);
    campaignId = camp?.id || `camp-unknown-${brandId}`;
  }
  if (!lead) {
    lead = {
      id: `lead-inbound-${Date.now()}`,
      email: input.channel === "email" ? input.from : undefined,
      phone: input.channel === "sms" ? input.from : undefined,
      source: "Inbound reply",
      groupName: "Inbound",
      purchaseDate: new Date().toISOString().slice(0, 10),
      costCents: 0,
      offeredEntityIds: [brandId],
      lastEntityId: brandId,
      convertedEntityId: null,
      status: "replied",
      optedOut: false,
      emailStatus: input.channel === "email" ? "valid" : "unverified",
      phoneStatus: input.channel === "sms" ? "valid" : "unverified",
      createdAt: new Date().toISOString(),
    };
    data.leads.unshift(lead);
  }

  const sentiment = guessSentiment(input.body);
  const reply: Reply = {
    id: `reply-${Date.now()}`,
    campaignId,
    brandId,
    leadId: lead.id,
    channel: input.channel,
    from: input.from,
    body: input.body,
    sentiment,
    manualForwarded: false,
    crmSynced: false,
    createdAt: new Date().toISOString(),
    read: false,
  };

  if (sentiment === "opt_out") {
    lead.optedOut = true;
    lead.status = "opted_out";
  } else {
    lead.status = "replied";
  }
  lead.lastEntityId = brandId;

  data.replies.unshift(reply);
  const campaign = data.campaigns.find((c) => c.id === campaignId);
  if (campaign) campaign.replyCount += 1;

  await writeStore(data);
  return reply;
}

export async function verifyLeads(input?: {
  leadIds?: string[];
  onlyUnverified?: boolean;
}): Promise<{ verified: number; invalid: number; risky: number }> {
  const data = await ensureStore();
  let verified = 0;
  let invalid = 0;
  let risky = 0;

  for (const lead of data.leads) {
    if (input?.leadIds?.length && !input.leadIds.includes(lead.id)) continue;
    if (
      input?.onlyUnverified !== false &&
      lead.emailStatus !== "unverified" &&
      lead.phoneStatus !== "unverified"
    ) {
      continue;
    }
    const next = applyVerification(lead);
    Object.assign(lead, next);
    verified += 1;
    if (next.emailStatus === "invalid" || next.phoneStatus === "invalid")
      invalid += 1;
    else if (next.emailStatus === "risky" || next.phoneStatus === "risky")
      risky += 1;
  }

  await writeStore(data);
  return { verified, invalid, risky };
}

export async function createCostEntry(
  input: Omit<CostEntry, "id" | "createdAt">,
): Promise<CostEntry> {
  const data = await ensureStore();
  const entry: CostEntry = {
    ...input,
    id: `cost-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  data.costEntries = data.costEntries || [];
  data.costEntries.unshift(entry);
  await writeStore(data);
  return entry;
}

export async function deleteCostEntry(id: string): Promise<boolean> {
  const data = await ensureStore();
  const before = data.costEntries?.length || 0;
  data.costEntries = (data.costEntries || []).filter((c) => c.id !== id);
  await writeStore(data);
  return (data.costEntries?.length || 0) < before;
}


export {
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  createAdFolder,
  updateAdFolder,
  deleteAdFolder,
  createAdAsset,
  updateAdAsset,
  deleteAdAsset,
  createSocialCampaign,
  updateSocialCampaign,
  deleteSocialCampaign,
  upsertSocialConnection,
  runAutopilotDay,
} from "@/lib/json-store-media";
