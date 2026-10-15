import { getPrisma } from "@/lib/db";
import { normalizeContact } from "@/lib/eligibility";
import {
  mapCampaign,
  mapCostEntry,
  mapEntity,
  mapLead,
  mapLeadSendEvent,
  mapOptOut,
  mapReply,
  mapRotation,
  mapSocialCampaign,
  mapSocialConnection,
  mapSpend,
  mapUpload,
  mapAdAsset,
  mapAdFolder,
  mapMessageTemplate,
  normalizeSocialLinks,
} from "@/lib/mappers";
import { normalizeRotation } from "@/lib/autopilot";
import type {
  Brand,
  Lead,
  PlatformData,
  RotationConfig,
  UploadBatch,
} from "@/lib/types";
import { asJson, safeFindMany } from "@/lib/neon-store-shared";
import { ensureSeeded, replaceWithSeed } from "@/lib/neon-store-seed";
import { applyVerification } from "@/lib/verify";

export type { LaunchResult } from "@/lib/neon-store-shared";
export type { AutopilotRunResult } from "@/lib/autopilot";

export async function getData(): Promise<PlatformData> {
  await ensureSeeded();
  const prisma = getPrisma();
  const [
    brands,
    leads,
    uploads,
    campaigns,
    replies,
    optOuts,
    providerSpend,
    costEntries,
    messageTemplates,
    adFolders,
    adAssets,
    socialCampaigns,
    socialConnections,
    sendEvents,
    settings,
  ] = await Promise.all([
    prisma.entity.findMany({ orderBy: { name: "asc" } }),
    prisma.lead.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.uploadBatch.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.reply.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.optOut.findMany({ orderBy: { createdAt: "desc" } }),
    safeFindMany(
      () => prisma.providerSpend.findMany({ orderBy: { source: "asc" } }),
      "ProviderSpend",
    ),
    safeFindMany(
      () => prisma.costEntry.findMany({ orderBy: { incurredAt: "desc" } }),
      "CostEntry",
    ),
    safeFindMany(
      () => prisma.messageTemplate.findMany({ orderBy: { updatedAt: "desc" } }),
      "MessageTemplate",
    ),
    safeFindMany(
      () => prisma.adFolder.findMany({ orderBy: { name: "asc" } }),
      "AdFolder",
    ),
    safeFindMany(
      () => prisma.adAsset.findMany({ orderBy: { updatedAt: "desc" } }),
      "AdAsset",
    ),
    safeFindMany(
      () =>
        prisma.socialCampaign.findMany({ orderBy: { updatedAt: "desc" } }),
      "SocialCampaign",
    ),
    safeFindMany(
      () =>
        prisma.socialConnection.findMany({ orderBy: { updatedAt: "desc" } }),
      "SocialConnection",
    ),
    safeFindMany(
      () =>
        prisma.leadSendEvent.findMany({
          orderBy: { sentAt: "desc" },
          take: 20_000,
        }),
      "LeadSendEvent",
    ),
    prisma.platformSettings.findUniqueOrThrow({ where: { id: "default" } }),
  ]);

  return {
    version: settings.version,
    brands: brands.map(mapEntity),
    leads: leads.map(mapLead),
    uploads: uploads.map(mapUpload),
    campaigns: campaigns.map(mapCampaign),
    replies: replies.map(mapReply),
    optOuts: optOuts.map(mapOptOut),
    providerSpend: providerSpend.map(mapSpend),
    costEntries: costEntries.map(mapCostEntry),
    messageTemplates: messageTemplates.map(mapMessageTemplate),
    adFolders: adFolders.map(mapAdFolder),
    adAssets: adAssets.map(mapAdAsset),
    socialCampaigns: socialCampaigns.map(mapSocialCampaign),
    socialConnections: socialConnections.map(mapSocialConnection),
    sendEvents: sendEvents.map(mapLeadSendEvent),
    rotation: mapRotation(settings, brands.map(mapEntity)),
  };
}

export async function resetData(): Promise<PlatformData> {
  return replaceWithSeed();
}

export async function updateBrand(
  id: string,
  patch: Partial<Brand>,
): Promise<Brand | null> {
  const prisma = getPrisma();
  const existing = await prisma.entity.findUnique({ where: { id } });
  if (!existing) return null;

  const updated = await prisma.entity.update({
    where: { id },
    data: {
      name: patch.name ?? existing.name,
      shortName: patch.shortName ?? existing.shortName,
      focus: patch.focus ?? existing.focus,
      programs: patch.programs ?? existing.programs,
      domain: patch.domain ?? existing.domain,
      sendingSubdomain: patch.sendingSubdomain ?? existing.sendingSubdomain,
      websiteUrl: patch.websiteUrl ?? existing.websiteUrl,
      websiteApiUrl: patch.websiteApiUrl ?? existing.websiteApiUrl,
      crm: patch.crm ?? existing.crm,
      status: patch.status ?? existing.status,
      phoneNumbers: patch.phoneNumbers ?? existing.phoneNumbers,
      tenDlcStatus: patch.tenDlcStatus ?? existing.tenDlcStatus,
      emailAuthStatus: patch.emailAuthStatus ?? existing.emailAuthStatus,
      weeklySendCap: patch.weeklySendCap ?? existing.weeklySendCap,
      rotationEnabled: patch.rotationEnabled ?? existing.rotationEnabled,
      socialLinks:
        patch.socialLinks !== undefined
          ? asJson(normalizeSocialLinks(patch.socialLinks))
          : undefined,
      notes: patch.notes === undefined ? existing.notes : patch.notes,
    },
  });
  return mapEntity(updated);
}

export async function updateRotation(
  patch: Partial<RotationConfig>,
): Promise<RotationConfig> {
  await ensureSeeded();
  const prisma = getPrisma();
  const brands = (await prisma.entity.findMany()).map(mapEntity);
  const current = mapRotation(
    await prisma.platformSettings.findUniqueOrThrow({ where: { id: "default" } }),
    brands,
  );
  const next = normalizeRotation({ ...current, ...patch }, brands);
  const updated = await prisma.platformSettings.update({
    where: { id: "default" },
    data: {
      mode: next.mode,
      entityOrder: next.entityOrder,
      notes: next.notes,
      autopilotEnabled: next.autopilotEnabled,
      autopilotJson: asJson({
        quotas: next.quotas,
        lastRunAt: next.lastRunAt ?? null,
        nextRunAt: next.nextRunAt ?? null,
        poolCursor: next.poolCursor ?? 0,
      }),
    },
  });
  return mapRotation(updated, brands);
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
  }>;
}): Promise<{ batch: UploadBatch; imported: Lead[]; duplicates: number }> {
  await ensureSeeded();
  const prisma = getPrisma();
  const groupName = input.groupName?.trim() || "General";
  const [existingLeads, optOuts] = await Promise.all([
    prisma.lead.findMany({ select: { email: true, phone: true } }),
    prisma.optOut.findMany({ select: { contact: true } }),
  ]);

  const existingKeys = new Set<string>();
  for (const lead of existingLeads) {
    if (lead.email) existingKeys.add(`e:${normalizeContact(lead.email)}`);
    if (lead.phone) existingKeys.add(`p:${normalizeContact(lead.phone)}`);
  }
  for (const opt of optOuts) {
    existingKeys.add(`o:${normalizeContact(opt.contact)}`);
  }

  const imported: Lead[] = [];
  let duplicates = 0;
  const batchId = `upload-${Date.now()}`;
  const costPerLead =
    input.rows.length > 0
      ? Math.round(input.costCents / input.rows.length)
      : 0;

  for (const row of input.rows) {
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
      // Caller should filter these; keep as skip, not "duplicate".
      continue;
    }

    const lead = applyVerification({
      id: `lead-${Date.now()}-${imported.length}`,
      email: row.email?.trim() || undefined,
      phone: row.phone?.trim() || undefined,
      firstName: row.firstName?.trim() || undefined,
      lastName: row.lastName?.trim() || undefined,
      source: input.source,
      groupName,
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
    groupName,
    purchaseDate: input.purchaseDate,
    costCents: input.costCents,
    rowCount: input.rows.length,
    duplicateCount: duplicates,
    importedCount: imported.length,
    createdAt: new Date().toISOString(),
  };

  const CHUNK = 250;
  await prisma.$transaction(
    async (tx) => {
      await tx.uploadBatch.create({
        data: {
          id: batch.id,
          filename: batch.filename,
          source: batch.source,
          groupName: batch.groupName,
          purchaseDate: new Date(batch.purchaseDate),
          costCents: batch.costCents,
          rowCount: batch.rowCount,
          duplicateCount: batch.duplicateCount,
          importedCount: batch.importedCount,
          createdAt: new Date(batch.createdAt),
        },
      });

      for (let i = 0; i < imported.length; i += CHUNK) {
        const slice = imported.slice(i, i + CHUNK);
        await tx.lead.createMany({
          data: slice.map((l) => ({
            id: l.id,
            email: l.email ?? null,
            phone: l.phone ?? null,
            firstName: l.firstName ?? null,
            lastName: l.lastName ?? null,
            source: l.source,
            groupName: l.groupName,
            purchaseDate: new Date(l.purchaseDate),
            costCents: l.costCents,
            offeredEntityIds: l.offeredEntityIds,
            lastEntityId: l.lastEntityId,
            convertedEntityId: l.convertedEntityId,
            status: l.status,
            optedOut: l.optedOut,
            emailStatus: l.emailStatus,
            phoneStatus: l.phoneStatus,
            verifyNotes: l.verifyNotes ?? null,
            verifiedAt: l.verifiedAt ? new Date(l.verifiedAt) : null,
            uploadBatchId: l.uploadBatchId ?? null,
            createdAt: new Date(l.createdAt),
          })),
        });
      }

      const spend = await tx.providerSpend.findUnique({
        where: { source: input.source },
      });
      if (spend) {
        await tx.providerSpend.update({
          where: { source: input.source },
          data: {
            leadsPurchased: spend.leadsPurchased + imported.length,
            costCents: spend.costCents + input.costCents,
          },
        });
      } else {
        await tx.providerSpend.create({
          data: {
            source: input.source,
            leadsPurchased: imported.length,
            costCents: input.costCents,
            replies: 0,
            conversions: 0,
          },
        });
      }
    },
    { timeout: 55_000 },
  );

  return { batch, imported, duplicates };
}


export {
  createCampaign,
  launchCampaign,
  applyOptOut,
  markReply,
  ingestReply,
  verifyLeads,
  createCostEntry,
  deleteCostEntry,
  runAutopilotDay,
} from "@/lib/neon-store-ops";

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
} from "@/lib/neon-store-media";
