import { getPrisma } from "@/lib/db";
import { deleteAdAssetFile } from "@/lib/ad-assets-fs";
import {
  mapAdAsset,
  mapAdFolder,
  mapMessageTemplate,
  mapSocialCampaign,
  mapSocialConnection,
} from "@/lib/mappers";
import type {
  AdAsset,
  AdFolder,
  MessageTemplate,
  SocialCampaign,
  SocialConnection,
} from "@/lib/types";
import { asJson, safeFindMany } from "@/lib/neon-store-shared";

export async function createMessageTemplate(
  input: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">,
): Promise<MessageTemplate> {
  const prisma = getPrisma();
  const id = `tpl-${Date.now()}`;
  const row = await prisma.messageTemplate.create({
    data: {
      id,
      name: input.name,
      channel: input.channel,
      subject: input.subject ?? null,
      body: input.body,
      brandId: input.brandId,
      folderId: input.folderId ?? null,
    },
  });
  return mapMessageTemplate(row);
}

export async function updateMessageTemplate(
  id: string,
  patch: Partial<
    Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">
  >,
): Promise<MessageTemplate | null> {
  const prisma = getPrisma();
  const existing = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!existing) return null;
  const row = await prisma.messageTemplate.update({
    where: { id },
    data: {
      name: patch.name ?? existing.name,
      channel: patch.channel ?? existing.channel,
      subject:
        patch.subject === undefined ? existing.subject : patch.subject ?? null,
      body: patch.body ?? existing.body,
      brandId:
        patch.brandId === undefined ? existing.brandId : patch.brandId,
      folderId:
        patch.folderId === undefined ? existing.folderId : patch.folderId,
    },
  });
  return mapMessageTemplate(row);
}

export async function deleteMessageTemplate(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.messageTemplate.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function createAdFolder(
  input: Omit<AdFolder, "id" | "createdAt" | "updatedAt">,
): Promise<AdFolder> {
  const prisma = getPrisma();
  const id = `fold-${Date.now()}`;
  const row = await prisma.adFolder.create({
    data: {
      id,
      name: input.name,
      brandId: input.brandId,
      parentId: input.parentId,
    },
  });
  return mapAdFolder(row);
}

export async function updateAdFolder(
  id: string,
  patch: Partial<Omit<AdFolder, "id" | "createdAt" | "updatedAt">>,
): Promise<AdFolder | null> {
  const prisma = getPrisma();
  const existing = await prisma.adFolder.findUnique({ where: { id } });
  if (!existing) return null;
  const row = await prisma.adFolder.update({
    where: { id },
    data: {
      name: patch.name ?? existing.name,
      brandId: patch.brandId === undefined ? existing.brandId : patch.brandId,
      parentId:
        patch.parentId === undefined ? existing.parentId : patch.parentId,
    },
  });
  return mapAdFolder(row);
}

export async function deleteAdFolder(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.adFolder.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function createAdAsset(
  input: Omit<AdAsset, "id" | "createdAt" | "updatedAt">,
): Promise<AdAsset> {
  const prisma = getPrisma();
  const id = `asset-${Date.now()}`;
  const row = await prisma.adAsset.create({
    data: {
      id,
      brandId: input.brandId,
      folderId: input.folderId,
      name: input.name,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storagePath: input.storagePath,
    },
  });
  return mapAdAsset(row);
}

export async function updateAdAsset(
  id: string,
  patch: Partial<Omit<AdAsset, "id" | "createdAt" | "updatedAt">>,
): Promise<AdAsset | null> {
  const prisma = getPrisma();
  const existing = await prisma.adAsset.findUnique({ where: { id } });
  if (!existing) return null;
  const row = await prisma.adAsset.update({
    where: { id },
    data: {
      brandId: patch.brandId === undefined ? existing.brandId : patch.brandId,
      folderId:
        patch.folderId === undefined ? existing.folderId : patch.folderId,
      name: patch.name ?? existing.name,
      originalName: patch.originalName ?? existing.originalName,
      mimeType: patch.mimeType ?? existing.mimeType,
      sizeBytes: patch.sizeBytes ?? existing.sizeBytes,
      storagePath: patch.storagePath ?? existing.storagePath,
    },
  });
  return mapAdAsset(row);
}

export async function deleteAdAsset(id: string): Promise<boolean> {
  const prisma = getPrisma();
  const existing = await prisma.adAsset.findUnique({ where: { id } });
  if (!existing) return false;
  await deleteAdAssetFile(existing.storagePath);
  await prisma.adAsset.delete({ where: { id } });
  return true;
}

export async function createSocialCampaign(
  input: Omit<SocialCampaign, "id" | "createdAt" | "updatedAt">,
): Promise<SocialCampaign> {
  const prisma = getPrisma();
  const id = `soc-${Date.now()}`;
  const row = await prisma.socialCampaign.create({
    data: {
      id,
      entityId: input.entityId,
      platform: input.platform,
      name: input.name,
      status: input.status,
      objective: input.objective || "",
      budgetCents: input.budgetCents ?? null,
      dailyBudgetCents: input.dailyBudgetCents ?? null,
      targetingNotes: input.targetingNotes ?? null,
      primaryText: input.primaryText ?? null,
      cta: input.cta ?? null,
      landingUrl: input.landingUrl ?? null,
      notes: input.notes ?? null,
      creativeAssetId: input.creativeAssetId ?? null,
      creativeTemplateId: input.creativeTemplateId ?? null,
      scheduleStart: input.scheduleStart
        ? new Date(input.scheduleStart)
        : null,
      scheduleEnd: input.scheduleEnd ? new Date(input.scheduleEnd) : null,
      impressions: input.impressions ?? 0,
      clicks: input.clicks ?? 0,
      leads: input.leads ?? 0,
      spendCents: input.spendCents ?? 0,
    },
  });
  return mapSocialCampaign(row);
}

export async function updateSocialCampaign(
  id: string,
  patch: Partial<Omit<SocialCampaign, "id" | "createdAt" | "updatedAt">>,
): Promise<SocialCampaign | null> {
  const prisma = getPrisma();
  const existing = await prisma.socialCampaign.findUnique({ where: { id } });
  if (!existing) return null;
  const row = await prisma.socialCampaign.update({
    where: { id },
    data: {
      entityId: patch.entityId ?? existing.entityId,
      platform: patch.platform ?? existing.platform,
      name: patch.name ?? existing.name,
      status: patch.status ?? existing.status,
      objective: patch.objective ?? existing.objective,
      budgetCents:
        patch.budgetCents === undefined
          ? existing.budgetCents
          : patch.budgetCents,
      dailyBudgetCents:
        patch.dailyBudgetCents === undefined
          ? existing.dailyBudgetCents
          : patch.dailyBudgetCents,
      targetingNotes:
        patch.targetingNotes === undefined
          ? existing.targetingNotes
          : patch.targetingNotes ?? null,
      primaryText:
        patch.primaryText === undefined
          ? existing.primaryText
          : patch.primaryText ?? null,
      cta: patch.cta === undefined ? existing.cta : patch.cta ?? null,
      landingUrl:
        patch.landingUrl === undefined
          ? existing.landingUrl
          : patch.landingUrl ?? null,
      notes: patch.notes === undefined ? existing.notes : patch.notes ?? null,
      creativeAssetId:
        patch.creativeAssetId === undefined
          ? existing.creativeAssetId
          : patch.creativeAssetId,
      creativeTemplateId:
        patch.creativeTemplateId === undefined
          ? existing.creativeTemplateId
          : patch.creativeTemplateId,
      scheduleStart:
        patch.scheduleStart === undefined
          ? existing.scheduleStart
          : patch.scheduleStart
            ? new Date(patch.scheduleStart)
            : null,
      scheduleEnd:
        patch.scheduleEnd === undefined
          ? existing.scheduleEnd
          : patch.scheduleEnd
            ? new Date(patch.scheduleEnd)
            : null,
      impressions: patch.impressions ?? existing.impressions,
      clicks: patch.clicks ?? existing.clicks,
      leads: patch.leads ?? existing.leads,
      spendCents: patch.spendCents ?? existing.spendCents,
    },
  });
  return mapSocialCampaign(row);
}

export async function deleteSocialCampaign(id: string): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.socialCampaign.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function upsertSocialConnection(
  input: Omit<SocialConnection, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
): Promise<SocialConnection> {
  const prisma = getPrisma();
  const existing = await prisma.socialConnection.findFirst({
    where: { entityId: input.entityId, platform: input.platform },
  });
  if (existing) {
    const row = await prisma.socialConnection.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        adAccountId: input.adAccountId || null,
        pixelOrEventsId: input.pixelOrEventsId || null,
        accessTokenNote: input.accessTokenNote || null,
        notes: input.notes || null,
      },
    });
    return mapSocialConnection(row);
  }
  const id = input.id || `sconn-${input.entityId}-${input.platform}-${Date.now()}`;
  const row = await prisma.socialConnection.create({
    data: {
      id,
      entityId: input.entityId,
      platform: input.platform,
      status: input.status,
      adAccountId: input.adAccountId || null,
      pixelOrEventsId: input.pixelOrEventsId || null,
      accessTokenNote: input.accessTokenNote || null,
      notes: input.notes || null,
    },
  });
  return mapSocialConnection(row);
}
