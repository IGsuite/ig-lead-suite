import {
  entityOfferCopy,
  normalizeRotation,
  tomorrowIso,
  type AutopilotRunResult,
} from "@/lib/autopilot";
import { getPrisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
import { isLeadEligibleForEntity, normalizeContact } from "@/lib/eligibility";
import {
  mapCampaign,
  mapCostEntry,
  mapEntity,
  mapLead,
  mapOptOut,
  mapReply,
  mapRotation,
  mapSpend,
  mapUpload,
} from "@/lib/mappers";
import { STORE_VERSION, createSeedData } from "@/lib/seed";
import type {
  Brand,
  Campaign,
  CostEntry,
  Lead,
  OptOut,
  PlatformData,
  Reply,
  RotationConfig,
  UploadBatch,
} from "@/lib/types";
import { deliverCampaignBatch } from "@/lib/send";
import { applyVerification } from "@/lib/verify";

async function ensureSeeded(): Promise<void> {
  const prisma = getPrisma();
  const settings = await prisma.platformSettings.findUnique({
    where: { id: "default" },
  });
  if (settings && settings.version === STORE_VERSION) return;
  await replaceWithSeed();
}

async function replaceWithSeed(): Promise<PlatformData> {
  const prisma = getPrisma();
  const seed = createSeedData();

  await prisma.$transaction(async (tx) => {
    await tx.reply.deleteMany();
    await tx.campaign.deleteMany();
    await tx.lead.deleteMany();
    await tx.uploadBatch.deleteMany();
    await tx.optOut.deleteMany();
    await tx.providerSpend.deleteMany();
    await tx.costEntry.deleteMany();
    await tx.entity.deleteMany();
    await tx.platformSettings.deleteMany();

    await tx.entity.createMany({
      data: seed.brands.map((b) => ({
        id: b.id,
        name: b.name,
        shortName: b.shortName,
        focus: b.focus,
        programs: b.programs,
        domain: b.domain,
        sendingSubdomain: b.sendingSubdomain,
        websiteUrl: b.websiteUrl,
        websiteApiUrl: b.websiteApiUrl,
        crm: b.crm,
        status: b.status,
        phoneNumbers: b.phoneNumbers,
        tenDlcStatus: b.tenDlcStatus,
        emailAuthStatus: b.emailAuthStatus,
        weeklySendCap: b.weeklySendCap,
        rotationEnabled: b.rotationEnabled,
        notes: b.notes ?? null,
      })),
    });

    await tx.uploadBatch.createMany({
      data: seed.uploads.map((u) => ({
        id: u.id,
        filename: u.filename,
        source: u.source,
        groupName: u.groupName,
        purchaseDate: new Date(u.purchaseDate),
        costCents: u.costCents,
        rowCount: u.rowCount,
        duplicateCount: u.duplicateCount,
        importedCount: u.importedCount,
        createdAt: new Date(u.createdAt),
      })),
    });

    await tx.lead.createMany({
      data: seed.leads.map((l) => ({
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

    await tx.campaign.createMany({
      data: seed.campaigns.map((c) => ({
        id: c.id,
        brandId: c.brandId,
        name: c.name,
        channel: c.channel,
        subject: c.subject ?? null,
        message: c.message,
        sourceFilter: c.sourceFilter,
        groupFilter: c.groupFilter,
        preferUnoffered: c.preferUnoffered,
        preferVerified: c.preferVerified,
        volume: c.volume,
        throttlePerHour: c.throttlePerHour,
        status: c.status,
        sentCount: c.sentCount,
        replyCount: c.replyCount,
        optOutCount: c.optOutCount,
        bounceCount: c.bounceCount,
        createdAt: new Date(c.createdAt),
        startedAt: c.startedAt ? new Date(c.startedAt) : null,
      })),
    });

    await tx.reply.createMany({
      data: seed.replies.map((r) => ({
        id: r.id,
        campaignId: r.campaignId,
        brandId: r.brandId,
        leadId: r.leadId,
        channel: r.channel,
        from: r.from,
        body: r.body,
        sentiment: r.sentiment,
        manualForwarded: r.manualForwarded,
        crmSynced: r.crmSynced,
        createdAt: new Date(r.createdAt),
        read: r.read,
      })),
    });

    await tx.optOut.createMany({
      data: seed.optOuts.map((o) => ({
        id: o.id,
        contact: o.contact,
        channel: o.channel,
        reason: o.reason,
        brandId: o.brandId,
        createdAt: new Date(o.createdAt),
      })),
    });

    await tx.providerSpend.createMany({
      data: seed.providerSpend.map((p) => ({
        source: p.source,
        leadsPurchased: p.leadsPurchased,
        costCents: p.costCents,
        replies: p.replies,
        conversions: p.conversions,
      })),
    });

    if (seed.costEntries.length) {
      await tx.costEntry.createMany({
        data: seed.costEntries.map((c) => ({
          id: c.id,
          brandId: c.brandId,
          category: c.category,
          label: c.label,
          vendor: c.vendor ?? null,
          amountCents: c.amountCents,
          incurredAt: new Date(c.incurredAt),
          notes: c.notes ?? null,
          createdAt: new Date(c.createdAt),
        })),
      });
    }

    await tx.platformSettings.create({
      data: {
        id: "default",
        version: STORE_VERSION,
        mode: seed.rotation.mode,
        entityOrder: seed.rotation.entityOrder,
        notes: seed.rotation.notes,
        autopilotEnabled: seed.rotation.autopilotEnabled,
        autopilotJson: asJson({
          quotas: seed.rotation.quotas,
          lastRunAt: seed.rotation.lastRunAt ?? null,
          nextRunAt: seed.rotation.nextRunAt ?? null,
        }),
      },
    });
  });

  return seed;
}

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
    settings,
  ] = await Promise.all([
    prisma.entity.findMany({ orderBy: { name: "asc" } }),
    prisma.lead.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.uploadBatch.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.reply.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.optOut.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.providerSpend.findMany({ orderBy: { source: "asc" } }),
    prisma.costEntry.findMany({ orderBy: { incurredAt: "desc" } }),
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
      duplicates += 1;
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

  await prisma.$transaction(async (tx) => {
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

    if (imported.length) {
      await tx.lead.createMany({
        data: imported.map((l) => ({
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
  });

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
  await ensureSeeded();
  const prisma = getPrisma();
  const created = await prisma.campaign.create({
    data: {
      id: `camp-${Date.now()}`,
      brandId: input.brandId,
      name: input.name,
      channel: input.channel,
      subject: input.subject ?? null,
      message: input.message,
      sourceFilter: input.sourceFilter,
      groupFilter: input.groupFilter,
      preferUnoffered: input.preferUnoffered,
      preferVerified: input.preferVerified,
      volume: input.volume,
      throttlePerHour: input.throttlePerHour,
      status: input.status,
    },
  });
  return mapCampaign(created);
}

export async function launchCampaign(id: string): Promise<Campaign | null> {
  await ensureSeeded();
  const prisma = getPrisma();
  const campaignRow = await prisma.campaign.findUnique({ where: { id } });
  if (!campaignRow) return null;
  const campaign = mapCampaign(campaignRow);

  const [leadRows, brandRow] = await Promise.all([
    prisma.lead.findMany(),
    prisma.entity.findUnique({ where: { id: campaign.brandId } }),
  ]);
  const eligible = leadRows
    .map(mapLead)
    .filter((lead) =>
      isLeadEligibleForEntity(lead, campaign.brandId, {
        channel: campaign.channel,
        sourceFilter: campaign.sourceFilter,
        groupFilter: campaign.groupFilter,
        preferUnoffered: campaign.preferUnoffered,
        preferVerified: campaign.preferVerified,
      }),
    )
    .sort((a, b) => a.offeredEntityIds.length - b.offeredEntityIds.length)
    .slice(0, campaign.volume);

  if (brandRow && eligible.length) {
    await deliverCampaignBatch({
      campaign,
      brand: mapEntity(brandRow),
      leads: eligible,
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const lead of eligible) {
      const offered = lead.offeredEntityIds.includes(campaign.brandId)
        ? lead.offeredEntityIds
        : [...lead.offeredEntityIds, campaign.brandId];
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          offeredEntityIds: offered,
          lastEntityId: campaign.brandId,
          status: "contacted",
        },
      });
    }

    await tx.campaign.update({
      where: { id },
      data: {
        status: "sending",
        sentCount: eligible.length,
        startedAt: new Date(),
      },
    });
  });

  const updated = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  return mapCampaign(updated);
}

export async function applyOptOut(input: {
  contact: string;
  channel: OptOut["channel"];
  reason: string;
  brandId?: string | null;
}): Promise<OptOut> {
  await ensureSeeded();
  const prisma = getPrisma();
  const normalized = normalizeContact(input.contact);

  const opt = await prisma.optOut.create({
    data: {
      id: `opt-${Date.now()}`,
      contact: input.contact,
      channel: input.channel,
      reason: input.reason,
      brandId: input.brandId ?? null,
    },
  });

  const leads = await prisma.lead.findMany();
  for (const lead of leads) {
    const emailMatch =
      lead.email && normalizeContact(lead.email) === normalized;
    const phoneMatch =
      lead.phone && normalizeContact(lead.phone) === normalized;
    if (emailMatch || phoneMatch) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { optedOut: true, status: "opted_out" },
      });
    }
  }

  return mapOptOut(opt);
}

export async function markReply(
  id: string,
  patch: Partial<
    Pick<Reply, "read" | "crmSynced" | "sentiment" | "manualForwarded">
  >,
): Promise<Reply | null> {
  await ensureSeeded();
  const prisma = getPrisma();
  const existing = await prisma.reply.findUnique({ where: { id } });
  if (!existing) return null;

  const updated = await prisma.reply.update({
    where: { id },
    data: {
      read: patch.read ?? existing.read,
      crmSynced: patch.crmSynced ?? existing.crmSynced,
      sentiment: patch.sentiment ?? existing.sentiment,
      manualForwarded: patch.manualForwarded ?? existing.manualForwarded,
    },
  });

  const sentiment = patch.sentiment ?? updated.sentiment;
  if (sentiment === "interested") {
    await prisma.lead.update({
      where: { id: updated.leadId },
      data: { status: "replied" },
    });
  }
  if (sentiment === "opt_out") {
    await prisma.lead.update({
      where: { id: updated.leadId },
      data: { optedOut: true, status: "opted_out" },
    });
  }

  return mapReply(updated);
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

export async function ingestReply(input: {
  channel: Reply["channel"];
  from: string;
  body: string;
  brandId?: string;
  campaignId?: string;
  leadId?: string;
}): Promise<Reply> {
  await ensureSeeded();
  const prisma = getPrisma();
  const fromNorm = normalizeContact(input.from);

  const leads = await prisma.lead.findMany();
  let leadRow =
    (input.leadId && leads.find((l) => l.id === input.leadId)) ||
    leads.find(
      (l) =>
        (l.email && normalizeContact(l.email) === fromNorm) ||
        (l.phone && normalizeContact(l.phone) === fromNorm),
    );

  let brandId = input.brandId;
  let campaignId = input.campaignId;
  if (!brandId && leadRow?.lastEntityId) brandId = leadRow.lastEntityId;
  if (!brandId && leadRow?.offeredEntityIds.length) {
    brandId = leadRow.offeredEntityIds[leadRow.offeredEntityIds.length - 1];
  }

  const campaigns = await prisma.campaign.findMany();
  // Ignore external ids (e.g. Smartlead campaign_id) that are not ours
  if (campaignId && !campaigns.some((c) => c.id === campaignId)) {
    campaignId = undefined;
  }
  if (!campaignId && brandId) {
    campaignId = campaigns.find(
      (c) =>
        c.brandId === brandId &&
        c.channel === input.channel &&
        (c.status === "sending" || c.status === "completed"),
    )?.id;
  }
  if (!brandId) {
    const first = await prisma.entity.findFirst();
    brandId = first?.id || "abstract";
  }
  if (!campaignId) {
    campaignId =
      campaigns.find((c) => c.brandId === brandId)?.id ||
      `camp-unknown-${brandId}`;
    if (!campaigns.some((c) => c.id === campaignId)) {
      await prisma.campaign.create({
        data: {
          id: campaignId,
          brandId,
          name: "Inbound catch-all",
          channel: input.channel,
          message: "(inbound)",
          status: "completed",
          volume: 0,
          throttlePerHour: 1,
        },
      });
    }
  }

  if (!leadRow) {
    const id = `lead-inbound-${Date.now()}`;
    leadRow = await prisma.lead.create({
      data: {
        id,
        email: input.channel === "email" ? input.from : null,
        phone: input.channel === "sms" ? input.from : null,
        source: "Inbound reply",
        groupName: "Inbound",
        purchaseDate: new Date(),
        costCents: 0,
        offeredEntityIds: [brandId],
        lastEntityId: brandId,
        status: "replied",
        optedOut: false,
        emailStatus: input.channel === "email" ? "valid" : "unverified",
        phoneStatus: input.channel === "sms" ? "valid" : "unverified",
      },
    });
  }

  const sentiment = guessSentiment(input.body);
  const reply = await prisma.reply.create({
    data: {
      id: `reply-${Date.now()}`,
      campaignId,
      brandId,
      leadId: leadRow.id,
      channel: input.channel,
      from: input.from,
      body: input.body,
      sentiment,
      manualForwarded: false,
      crmSynced: false,
      read: false,
    },
  });

  await prisma.lead.update({
    where: { id: leadRow.id },
    data: {
      lastEntityId: brandId,
      status: sentiment === "opt_out" ? "opted_out" : "replied",
      optedOut: sentiment === "opt_out",
    },
  });
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { replyCount: { increment: 1 } },
  });

  return mapReply(reply);
}

export async function verifyLeads(input?: {
  leadIds?: string[];
  onlyUnverified?: boolean;
}): Promise<{ verified: number; invalid: number; risky: number }> {
  await ensureSeeded();
  const prisma = getPrisma();
  const { verifyContact } = await import("@/lib/verify");
  const leads = await prisma.lead.findMany();
  let verified = 0;
  let invalid = 0;
  let risky = 0;

  for (const lead of leads) {
    if (input?.leadIds?.length && !input.leadIds.includes(lead.id)) continue;
    if (
      input?.onlyUnverified !== false &&
      lead.emailStatus !== "unverified" &&
      lead.phoneStatus !== "unverified"
    ) {
      continue;
    }
    const result = verifyContact({
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        emailStatus: result.emailStatus,
        phoneStatus: result.phoneStatus,
        verifyNotes: result.verifyNotes,
        verifiedAt: new Date(),
      },
    });
    verified += 1;
    if (result.emailStatus === "invalid" || result.phoneStatus === "invalid")
      invalid += 1;
    else if (result.emailStatus === "risky" || result.phoneStatus === "risky")
      risky += 1;
  }

  return { verified, invalid, risky };
}

export async function createCostEntry(
  input: Omit<CostEntry, "id" | "createdAt">,
): Promise<CostEntry> {
  await ensureSeeded();
  const prisma = getPrisma();
  const created = await prisma.costEntry.create({
    data: {
      id: `cost-${Date.now()}`,
      brandId: input.brandId,
      category: input.category,
      label: input.label,
      vendor: input.vendor ?? null,
      amountCents: input.amountCents,
      incurredAt: new Date(input.incurredAt),
      notes: input.notes ?? null,
    },
  });
  return mapCostEntry(created);
}

export async function deleteCostEntry(id: string): Promise<boolean> {
  await ensureSeeded();
  const prisma = getPrisma();
  try {
    await prisma.costEntry.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function runAutopilotDay(): Promise<AutopilotRunResult> {
  await ensureSeeded();
  const prisma = getPrisma();
  const brands = (await prisma.entity.findMany()).map(mapEntity);
  const settings = await prisma.platformSettings.findUniqueOrThrow({
    where: { id: "default" },
  });
  const rotation = mapRotation(settings, brands);
  const day = new Date().toISOString().slice(0, 10);
  const legs: AutopilotRunResult["legs"] = [];

  for (const entityId of rotation.entityOrder) {
    const brand = brands.find((b) => b.id === entityId);
    const quota = rotation.quotas.find((q) => q.entityId === entityId);
    if (!brand || !quota?.enabled || !brand.rotationEnabled) continue;

    const copy = entityOfferCopy(brand);
    const channelLegs: Array<{
      channel: "sms" | "email";
      volume: number;
      subject?: string;
      message: string;
    }> = [
      { channel: "sms", volume: quota.dailySmsVolume, message: copy.sms },
      {
        channel: "email",
        volume: quota.dailyEmailVolume,
        subject: copy.emailSubject,
        message: copy.emailBody,
      },
    ];

    const leadRows = await prisma.lead.findMany();
    const mappedLeads = leadRows.map(mapLead);
    const alreadyOffered = new Set(
      mappedLeads
        .filter((l) => l.offeredEntityIds.includes(entityId))
        .map((l) => l.id),
    );

    for (const leg of channelLegs) {
      if (leg.volume <= 0) continue;
      const campaignId = `camp-auto-${entityId}-${leg.channel}-${Date.now()}-${legs.length}`;
      await prisma.campaign.create({
        data: {
          id: campaignId,
          brandId: entityId,
          name: `Autopilot · ${brand.shortName} · ${leg.channel.toUpperCase()} · ${day}`,
          channel: leg.channel,
          subject: leg.subject ?? null,
          message: leg.message,
          sourceFilter: "all",
          groupFilter: "all",
          preferUnoffered: true,
          preferVerified: true,
          volume: leg.volume,
          throttlePerHour: Math.max(60, Math.round(leg.volume / 12)),
          status: "draft",
        },
      });

      const eligible = mappedLeads
        .filter((lead) => {
          if (alreadyOffered.has(lead.id)) return false;
          return isLeadEligibleForEntity(lead, entityId, {
            channel: leg.channel,
            sourceFilter: "all",
            groupFilter: "all",
            preferUnoffered: false,
            preferVerified: true,
          });
        })
        .sort((a, b) => a.offeredEntityIds.length - b.offeredEntityIds.length)
        .slice(0, leg.volume);

      const campaign: Campaign = {
        id: campaignId,
        brandId: entityId,
        name: `Autopilot · ${brand.shortName} · ${leg.channel.toUpperCase()} · ${day}`,
        channel: leg.channel,
        subject: leg.subject,
        message: leg.message,
        sourceFilter: "all",
        groupFilter: "all",
        preferUnoffered: true,
        preferVerified: true,
        volume: leg.volume,
        throttlePerHour: Math.max(60, Math.round(leg.volume / 12)),
        status: "draft",
        sentCount: 0,
        replyCount: 0,
        optOutCount: 0,
        bounceCount: 0,
        createdAt: new Date().toISOString(),
      };

      if (eligible.length) {
        await deliverCampaignBatch({ campaign, brand, leads: eligible });
      }

      await prisma.$transaction(async (tx) => {
        for (const lead of eligible) {
          const offered = lead.offeredEntityIds.includes(entityId)
            ? lead.offeredEntityIds
            : [...lead.offeredEntityIds, entityId];
          await tx.lead.update({
            where: { id: lead.id },
            data: {
              offeredEntityIds: offered,
              lastEntityId: entityId,
              status: "contacted",
            },
          });
        }
        await tx.campaign.update({
          where: { id: campaignId },
          data: {
            status: "sending",
            sentCount: eligible.length,
            startedAt: new Date(),
          },
        });
      });

      legs.push({
        entityId,
        channel: leg.channel,
        campaignId,
        sent: eligible.length,
        volume: leg.volume,
      });
    }
  }

  const ranAt = new Date().toISOString();
  const nextRunAt = tomorrowIso();
  await prisma.platformSettings.update({
    where: { id: "default" },
    data: {
      autopilotEnabled: true,
      autopilotJson: asJson({
        quotas: rotation.quotas,
        lastRunAt: ranAt,
        nextRunAt,
      }),
    },
  });

  return { ranAt, nextRunAt, legs };
}
