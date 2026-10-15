import { getPrisma } from "@/lib/db";
import {
  STORE_VERSION,
  createSeedData,
  materializeSeedAdAssets,
} from "@/lib/seed";
import type { PlatformData } from "@/lib/types";
import {
  asJson,
  safeFindMany,
} from "@/lib/neon-store-shared";
import { normalizeSocialLinks } from "@/lib/mappers";
import { Prisma } from "@/generated/prisma/client";
import { normalizeSendWindow } from "@/lib/send-window";

export async function ensureSeeded(): Promise<void> {
  const prisma = getPrisma();
  const settings = await prisma.platformSettings.findUnique({
    where: { id: "default" },
  });
  if (settings && settings.version === STORE_VERSION) return;

  // Never wipe live entity data on a STORE_VERSION bump — that loop destroys the CRM.
  // Soft-bump when brands already exist; only full-seed an empty database.
  const brandCount = settings
    ? await prisma.entity.count().catch(() => 0)
    : 0;
  if (brandCount > 0 && settings) {
    try {
      await Promise.all([
        safeFindMany(() => prisma.messageTemplate.findMany({ take: 1 }), "MessageTemplate"),
        safeFindMany(() => prisma.adFolder.findMany({ take: 1 }), "AdFolder"),
        safeFindMany(() => prisma.adAsset.findMany({ take: 1 }), "AdAsset"),
        safeFindMany(
          () => prisma.socialCampaign.findMany({ take: 1 }),
          "SocialCampaign",
        ),
        safeFindMany(
          () => prisma.socialConnection.findMany({ take: 1 }),
          "SocialConnection",
        ),
        safeFindMany(
          () => prisma.leadSendEvent.findMany({ take: 1 }),
          "LeadSendEvent",
        ),
      ]);
      await prisma.platformSettings.update({
        where: { id: "default" },
        data: { version: STORE_VERSION },
      });
    } catch (err) {
      console.error(
        "[neon-store] STORE_VERSION soft-bump failed; refusing wipe because entities exist. Run `npx prisma db push`.",
        err,
      );
    }
    return;
  }

  await replaceWithSeed();
}

export async function replaceWithSeed(): Promise<PlatformData> {
  const prisma = getPrisma();
  const seed = await materializeSeedAdAssets(createSeedData());

  await prisma.$transaction(async (tx) => {
    await tx.reply.deleteMany();
    await tx.leadSendEvent.deleteMany().catch(() => undefined);
    await tx.campaign.deleteMany();
    await tx.socialCampaign.deleteMany();
    await tx.socialConnection.deleteMany();
    await tx.messageTemplate.deleteMany();
    await tx.adAsset.deleteMany();
    await tx.adFolder.deleteMany();
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
        socialLinks: asJson(normalizeSocialLinks(b.socialLinks)),
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
      data: seed.campaigns.map((c) => {
        const win = normalizeSendWindow(c);
        return {
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
          mode: c.mode || "own",
          volume: c.volume,
          throttlePerHour: c.throttlePerHour,
          sendWindowPreset: win.sendWindowPreset,
          sendWindowStart: win.sendWindowStart,
          sendWindowEnd: win.sendWindowEnd,
          timezone: win.timezone,
          status: c.status,
          sentCount: c.sentCount,
          replyCount: c.replyCount,
          optOutCount: c.optOutCount,
          bounceCount: c.bounceCount,
          createdAt: new Date(c.createdAt),
          startedAt: c.startedAt ? new Date(c.startedAt) : null,
        };
      }),
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

    if (seed.adFolders?.length) {
      await tx.adFolder.createMany({
        data: seed.adFolders.map((f) => ({
          id: f.id,
          name: f.name,
          brandId: f.brandId,
          parentId: f.parentId,
          createdAt: new Date(f.createdAt),
          updatedAt: new Date(f.updatedAt),
        })),
      });
    }

    if (seed.messageTemplates?.length) {
      await tx.messageTemplate.createMany({
        data: seed.messageTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          channel: t.channel,
          subject: t.subject ?? null,
          body: t.body,
          brandId: t.brandId,
          folderId: t.folderId ?? null,
          createdAt: new Date(t.createdAt),
          updatedAt: new Date(t.updatedAt),
        })),
      });
    }

    if (seed.adAssets?.length) {
      await tx.adAsset.createMany({
        data: seed.adAssets.map((a) => ({
          id: a.id,
          brandId: a.brandId,
          folderId: a.folderId,
          name: a.name,
          originalName: a.originalName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          storagePath: a.storagePath,
          createdAt: new Date(a.createdAt),
          updatedAt: new Date(a.updatedAt),
        })),
      });
    }

    if (seed.socialCampaigns?.length) {
      await tx.socialCampaign.createMany({
        data: seed.socialCampaigns.map((c) => ({
          id: c.id,
          entityId: c.entityId,
          platform: c.platform,
          name: c.name,
          status: c.status,
          objective: c.objective,
          budgetCents: c.budgetCents ?? null,
          dailyBudgetCents: c.dailyBudgetCents ?? null,
          targetingNotes: c.targetingNotes ?? null,
          primaryText: c.primaryText ?? null,
          cta: c.cta ?? null,
          landingUrl: c.landingUrl ?? null,
          notes: c.notes ?? null,
          creativeAssetId: c.creativeAssetId ?? null,
          creativeTemplateId: c.creativeTemplateId ?? null,
          scheduleStart: c.scheduleStart ? new Date(c.scheduleStart) : null,
          scheduleEnd: c.scheduleEnd ? new Date(c.scheduleEnd) : null,
          impressions: c.impressions,
          clicks: c.clicks,
          leads: c.leads,
          spendCents: c.spendCents,
          createdAt: new Date(c.createdAt),
          updatedAt: new Date(c.updatedAt),
        })),
      });
    }

    if (seed.socialConnections?.length) {
      await tx.socialConnection.createMany({
        data: seed.socialConnections.map((c) => ({
          id: c.id,
          entityId: c.entityId,
          platform: c.platform,
          status: c.status,
          adAccountId: c.adAccountId || null,
          pixelOrEventsId: c.pixelOrEventsId || null,
          accessTokenNote: c.accessTokenNote || null,
          notes: c.notes || null,
          createdAt: new Date(c.createdAt),
          updatedAt: new Date(c.updatedAt),
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
          poolCursor: seed.rotation.poolCursor ?? 0,
        }),
      },
    });
  });

  return seed;
}

