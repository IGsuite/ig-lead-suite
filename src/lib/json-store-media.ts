import {
  entityOfferCopy,
  normalizeRotation,
  tomorrowIso,
  type AutopilotRunResult,
} from "@/lib/autopilot";
import { deleteAdAssetFile } from "@/lib/ad-assets-fs";
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
  MessageTemplate,
  SocialCampaign,
  SocialConnection,
} from "@/lib/types";
import { deliverCampaignBatch } from "@/lib/send";
import {
  isWithinSendWindow,
  normalizeSendWindow,
} from "@/lib/send-window";
import { ensureStore, writeStore } from "@/lib/json-store-io";

export type { AutopilotRunResult };

export async function createMessageTemplate(
  input: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">,
): Promise<MessageTemplate> {
  const data = await ensureStore();
  const now = new Date().toISOString();
  const template: MessageTemplate = {
    ...input,
    folderId: input.folderId ?? null,
    id: `tpl-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };
  data.messageTemplates = data.messageTemplates || [];
  data.messageTemplates.unshift(template);
  await writeStore(data);
  return template;
}

export async function updateMessageTemplate(
  id: string,
  patch: Partial<
    Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">
  >,
): Promise<MessageTemplate | null> {
  const data = await ensureStore();
  const idx = (data.messageTemplates || []).findIndex((t) => t.id === id);
  if (idx < 0) return null;
  data.messageTemplates[idx] = {
    ...data.messageTemplates[idx],
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(data);
  return data.messageTemplates[idx];
}

export async function deleteMessageTemplate(id: string): Promise<boolean> {
  const data = await ensureStore();
  const before = data.messageTemplates?.length || 0;
  data.messageTemplates = (data.messageTemplates || []).filter(
    (t) => t.id !== id,
  );
  await writeStore(data);
  return (data.messageTemplates?.length || 0) < before;
}

export async function createAdFolder(
  input: Omit<AdFolder, "id" | "createdAt" | "updatedAt">,
): Promise<AdFolder> {
  const data = await ensureStore();
  const now = new Date().toISOString();
  const folder: AdFolder = {
    ...input,
    id: `fold-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };
  data.adFolders = data.adFolders || [];
  data.adFolders.unshift(folder);
  await writeStore(data);
  return folder;
}

export async function updateAdFolder(
  id: string,
  patch: Partial<Omit<AdFolder, "id" | "createdAt" | "updatedAt">>,
): Promise<AdFolder | null> {
  const data = await ensureStore();
  const idx = (data.adFolders || []).findIndex((f) => f.id === id);
  if (idx < 0) return null;
  data.adFolders[idx] = {
    ...data.adFolders[idx],
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(data);
  return data.adFolders[idx];
}

export async function deleteAdFolder(id: string): Promise<boolean> {
  const data = await ensureStore();
  const folders = data.adFolders || [];
  const toRemove = new Set<string>();
  function collect(fid: string) {
    toRemove.add(fid);
    for (const child of folders.filter((f) => f.parentId === fid)) {
      collect(child.id);
    }
  }
  if (!folders.some((f) => f.id === id)) return false;
  collect(id);
  data.adFolders = folders.filter((f) => !toRemove.has(f.id));
  data.messageTemplates = (data.messageTemplates || []).map((t) =>
    t.folderId && toRemove.has(t.folderId) ? { ...t, folderId: null } : t,
  );
  data.adAssets = (data.adAssets || []).map((a) =>
    a.folderId && toRemove.has(a.folderId) ? { ...a, folderId: null } : a,
  );
  await writeStore(data);
  return true;
}

export async function createAdAsset(
  input: Omit<AdAsset, "id" | "createdAt" | "updatedAt">,
): Promise<AdAsset> {
  const data = await ensureStore();
  const now = new Date().toISOString();
  const asset: AdAsset = {
    ...input,
    id: `asset-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };
  data.adAssets = data.adAssets || [];
  data.adAssets.unshift(asset);
  await writeStore(data);
  return asset;
}

export async function updateAdAsset(
  id: string,
  patch: Partial<Omit<AdAsset, "id" | "createdAt" | "updatedAt">>,
): Promise<AdAsset | null> {
  const data = await ensureStore();
  const idx = (data.adAssets || []).findIndex((a) => a.id === id);
  if (idx < 0) return null;
  data.adAssets[idx] = {
    ...data.adAssets[idx],
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(data);
  return data.adAssets[idx];
}

export async function deleteAdAsset(id: string): Promise<boolean> {
  const data = await ensureStore();
  const existing = (data.adAssets || []).find((a) => a.id === id);
  if (!existing) return false;
  await deleteAdAssetFile(existing.storagePath);
  data.adAssets = (data.adAssets || []).filter((a) => a.id !== id);
  await writeStore(data);
  return true;
}

export async function createSocialCampaign(
  input: Omit<SocialCampaign, "id" | "createdAt" | "updatedAt">,
): Promise<SocialCampaign> {
  const data = await ensureStore();
  const now = new Date().toISOString();
  const campaign: SocialCampaign = {
    ...input,
    id: `soc-${Date.now()}`,
    impressions: input.impressions ?? 0,
    clicks: input.clicks ?? 0,
    leads: input.leads ?? 0,
    spendCents: input.spendCents ?? 0,
    createdAt: now,
    updatedAt: now,
  };
  data.socialCampaigns = data.socialCampaigns || [];
  data.socialCampaigns.unshift(campaign);
  await writeStore(data);
  return campaign;
}

export async function updateSocialCampaign(
  id: string,
  patch: Partial<Omit<SocialCampaign, "id" | "createdAt" | "updatedAt">>,
): Promise<SocialCampaign | null> {
  const data = await ensureStore();
  data.socialCampaigns = data.socialCampaigns || [];
  const idx = data.socialCampaigns.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  data.socialCampaigns[idx] = {
    ...data.socialCampaigns[idx],
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(data);
  return data.socialCampaigns[idx];
}

export async function deleteSocialCampaign(id: string): Promise<boolean> {
  const data = await ensureStore();
  const before = data.socialCampaigns?.length || 0;
  data.socialCampaigns = (data.socialCampaigns || []).filter(
    (c) => c.id !== id,
  );
  await writeStore(data);
  return (data.socialCampaigns?.length || 0) < before;
}

export async function upsertSocialConnection(
  input: Omit<SocialConnection, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
): Promise<SocialConnection> {
  const data = await ensureStore();
  data.socialConnections = data.socialConnections || [];
  const idx = data.socialConnections.findIndex(
    (c) => c.entityId === input.entityId && c.platform === input.platform,
  );
  const now = new Date().toISOString();
  if (idx >= 0) {
    data.socialConnections[idx] = {
      ...data.socialConnections[idx],
      ...input,
      id: data.socialConnections[idx].id,
      updatedAt: now,
    };
    await writeStore(data);
    return data.socialConnections[idx];
  }
  const connection: SocialConnection = {
    id:
      input.id ||
      `sconn-${input.entityId}-${input.platform}-${Date.now()}`,
    entityId: input.entityId,
    platform: input.platform,
    status: input.status,
    adAccountId: input.adAccountId,
    pixelOrEventsId: input.pixelOrEventsId,
    accessTokenNote: input.accessTokenNote,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
  data.socialConnections.unshift(connection);
  await writeStore(data);
  return connection;
}

/** One daily Ferris-wheel pass: each enabled entity gets its own SMS + email blast. */
export async function runAutopilotDay(): Promise<AutopilotRunResult> {
  const data = await ensureStore();
  const rotation = normalizeRotation(data.rotation, data.brands);
  const day = new Date().toISOString().slice(0, 10);
  const legs: AutopilotRunResult["legs"] = [];
  let poolCursor = rotation.poolCursor ?? 0;
  if (!Array.isArray(data.sendEvents)) data.sendEvents = [];

  for (const entityId of rotation.entityOrder) {
    const brand = data.brands.find((b) => b.id === entityId);
    const quota = rotation.quotas.find((q) => q.entityId === entityId);
    if (!brand || !quota?.enabled || !brand.rotationEnabled) continue;

    const win = normalizeSendWindow({
      sendWindowPreset: quota.sendWindowPreset || "morning",
      sendWindowStart: quota.sendWindowStart,
      sendWindowEnd: quota.sendWindowEnd,
      timezone: quota.timezone,
    });
    const inWindow = isWithinSendWindow(win);

    const copy = entityOfferCopy(brand);
    const channels: Array<{
      channel: "sms" | "email";
      volume: number;
      subject?: string;
      message: string;
    }> = [
      {
        channel: "sms",
        volume: quota.dailySmsVolume,
        message: copy.sms,
      },
      {
        channel: "email",
        volume: quota.dailyEmailVolume,
        subject: copy.emailSubject,
        message: copy.emailBody,
      },
    ];

    for (const leg of channels) {
      if (leg.volume <= 0) continue;
      const campaign: Campaign = {
        id: `camp-auto-${entityId}-${leg.channel}-${Date.now()}-${legs.length}`,
        brandId: entityId,
        name: `Autopilot · ${brand.shortName} · ${leg.channel.toUpperCase()} · ${day}`,
        channel: leg.channel,
        subject: leg.subject,
        message: leg.message,
        sourceFilter: "all",
        groupFilter: "all",
        preferUnoffered: false,
        preferVerified: true,
        mode: "auto",
        volume: leg.volume,
        throttlePerHour: Math.max(60, Math.round(leg.volume / 12)),
        sendWindowPreset: win.sendWindowPreset,
        sendWindowStart: win.sendWindowStart,
        sendWindowEnd: win.sendWindowEnd,
        timezone: win.timezone,
        status: inWindow ? "draft" : "scheduled",
        sentCount: 0,
        replyCount: 0,
        optOutCount: 0,
        bounceCount: 0,
        createdAt: new Date().toISOString(),
      };
      data.campaigns.unshift(campaign);

      if (!inWindow) {
        legs.push({
          entityId,
          channel: leg.channel,
          campaignId: campaign.id,
          sent: 0,
          volume: leg.volume,
        });
        continue;
      }

      const fingerprint = messageFingerprint(
        leg.channel,
        leg.message,
        leg.subject,
      );
      const pick = selectLeadsForSend({
        leads: data.leads,
        sendEvents: data.sendEvents,
        entityId,
        channel: leg.channel,
        volume: leg.volume,
        mode: "auto",
        messageFingerprint: fingerprint,
        sourceFilter: "all",
        groupFilter: "all",
        preferVerified: true,
        preferUnoffered: false,
        poolCursor,
      });
      poolCursor = pick.nextCursor;
      const eligible = pick.selected;

      const summary = eligible.length ? await deliverCampaignBatch({ campaign, brand, leads: eligible }) : null;
      const acceptedIds = new Set(summary?.results.filter(r => r.status === "accepted").map(r => r.leadId));
      const accepted = eligible.filter(lead => acceptedIds.has(lead.id));

      for (const lead of accepted) {
        if (!lead.offeredEntityIds.includes(entityId)) {
          lead.offeredEntityIds.push(entityId);
        }
        lead.lastEntityId = entityId;
        lead.status = "contacted";
      }

      const events = buildSendEvents({
        leads: accepted,
        entityId,
        campaignId: campaign.id,
        channel: leg.channel,
        messageFingerprint: fingerprint,
        mode: "auto",
      });
      data.sendEvents = [...events, ...data.sendEvents].slice(0, 50_000);

      campaign.status = "sending";
      campaign.sentCount = accepted.length;
      campaign.startedAt = new Date().toISOString();

      legs.push({
        entityId,
        channel: leg.channel,
        campaignId: campaign.id,
        sent: accepted.length,
        volume: leg.volume,
      });
    }
  }

  const ranAt = new Date().toISOString();
  const nextRunAt = tomorrowIso();
  data.rotation = {
    ...rotation,
    lastRunAt: ranAt,
    nextRunAt,
    autopilotEnabled: true,
    poolCursor,
  };
  await writeStore(data);
  return { ranAt, nextRunAt, legs };
}
