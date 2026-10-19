import {
  entityOfferCopy,
  normalizeRotation,
  tomorrowIso,
  type AutopilotRunResult,
} from "@/lib/autopilot";
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
} from "@/lib/mappers";
import {
  buildSendEvents,
  messageFingerprint,
  selectLeadsForSend,
} from "@/lib/rotation-select";
import type {
  Brand,
  Campaign,
  CostEntry,
  Lead,
  OptOut,
  Reply,
} from "@/lib/types";
import { deliverCampaignBatch } from "@/lib/send";
import {
  isWithinSendWindow,
  normalizeSendWindow,
  sendWindowLabel,
} from "@/lib/send-window";
import { applyVerification } from "@/lib/verify";
import {
  asJson,
  guessSentiment,
  safeFindMany,
  type LaunchResult,
} from "@/lib/neon-store-shared";
import { ensureSeeded } from "@/lib/neon-store-seed";

export type { AutopilotRunResult, LaunchResult };

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
  const win = normalizeSendWindow(input);
  const created = await prisma.campaign.create({
    data: {
      id: `camp-${Date.now()}`,
      brandId: input.brandId,
      name: input.name,
      channel: input.channel,
      subject: input.subject ?? null,
      message: input.message,
      htmlMessage: input.htmlMessage ?? null,
      imageUrl: input.imageUrl ?? null,
      imageAlt: input.imageAlt ?? null,
      sourceFilter: input.sourceFilter,
      groupFilter: input.groupFilter,
      preferUnoffered: input.preferUnoffered,
      preferVerified: input.preferVerified,
      mode: input.mode || "own",
      volume: input.volume,
      throttlePerHour: input.throttlePerHour,
      sendWindowPreset: win.sendWindowPreset,
      sendWindowStart: win.sendWindowStart,
      sendWindowEnd: win.sendWindowEnd,
      timezone: win.timezone,
      status: input.status,
    },
  });
  return mapCampaign(created);
}

export async function setCampaignStatus(
  id: string,
  status: Campaign["status"],
): Promise<Campaign | null> {
  await ensureSeeded();
  const prisma = getPrisma();
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) return null;
  const updated = await prisma.campaign.update({
    where: { id },
    data: { status },
  });
  return mapCampaign(updated);
}

export async function launchCampaign(id: string): Promise<LaunchResult | null> {
  await ensureSeeded();
  const prisma = getPrisma();
  const campaignRow = await prisma.campaign.findUnique({ where: { id } });
  if (!campaignRow) return null;
  const campaign = mapCampaign(campaignRow);

  if (!isWithinSendWindow(campaign)) {
    const updated = await prisma.campaign.update({
      where: { id },
      data: { status: "scheduled" },
    });
    return {
      campaign: mapCampaign(updated),
      deferred: true,
      reason: "outside_send_window",
      windowLabel: sendWindowLabel(campaign),
    };
  }

  const [leadRows, brandRow, sendEventRows, settings] = await Promise.all([
    prisma.lead.findMany(),
    prisma.entity.findUnique({ where: { id: campaign.brandId } }),
    safeFindMany(
      () =>
        prisma.leadSendEvent.findMany({
          orderBy: { sentAt: "desc" },
          take: 20_000,
        }),
      "LeadSendEvent",
    ),
    prisma.platformSettings.findUnique({ where: { id: "default" } }),
  ]);
  const brands = brandRow ? [mapEntity(brandRow)] : [];
  const rotation = settings
    ? mapRotation(settings, brands)
    : normalizeRotation({ entityOrder: [] }, brands);
  const fingerprint = messageFingerprint(
    campaign.channel,
    campaign.message,
    campaign.subject,
  );
  const pick = selectLeadsForSend({
    leads: leadRows.map(mapLead),
    sendEvents: sendEventRows.map(mapLeadSendEvent),
    entityId: campaign.brandId,
    channel: campaign.channel,
    volume: campaign.volume,
    mode: campaign.mode || "own",
    messageFingerprint: fingerprint,
    sourceFilter: campaign.sourceFilter,
    groupFilter: campaign.groupFilter,
    preferVerified: campaign.preferVerified,
    preferUnoffered: campaign.preferUnoffered,
    poolCursor: rotation.poolCursor ?? 0,
  });
  const eligible = pick.selected;

  if (brandRow && eligible.length) {
    await deliverCampaignBatch({
      campaign,
      brand: mapEntity(brandRow),
      leads: eligible,
    });
  }

  const events = buildSendEvents({
    leads: eligible,
    entityId: campaign.brandId,
    campaignId: campaign.id,
    channel: campaign.channel,
    messageFingerprint: fingerprint,
    mode: campaign.mode || "own",
  });

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

    if (events.length) {
      await tx.leadSendEvent.createMany({
        data: events.map((e) => ({
          id: e.id,
          leadId: e.leadId,
          entityId: e.entityId,
          campaignId: e.campaignId,
          channel: e.channel,
          messageFingerprint: e.messageFingerprint,
          mode: e.mode,
          sentAt: new Date(e.sentAt),
        })),
      });
    }

    if (campaign.mode === "auto" && settings) {
      await tx.platformSettings.update({
        where: { id: "default" },
        data: {
          autopilotJson: asJson({
            quotas: rotation.quotas,
            lastRunAt: rotation.lastRunAt ?? null,
            nextRunAt: rotation.nextRunAt ?? null,
            poolCursor: pick.nextCursor,
          }),
        },
      });
    }

    await tx.campaign.update({
      where: { id },
      data: {
        status: "sending",
        sentCount: eligible.length,
        startedAt: new Date(),
        mode: campaign.mode || "own",
      },
    });
  });

  const updated = await prisma.campaign.findUniqueOrThrow({ where: { id } });
  return { campaign: mapCampaign(updated), deferred: false };
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
  let poolCursor = rotation.poolCursor ?? 0;

  const leadRows = await prisma.lead.findMany();
  let mappedLeads = leadRows.map(mapLead);
  let sendEvents = (
    await safeFindMany(
      () =>
        prisma.leadSendEvent.findMany({
          orderBy: { sentAt: "desc" },
          take: 20_000,
        }),
      "LeadSendEvent",
    )
  ).map(mapLeadSendEvent);

  for (const entityId of rotation.entityOrder) {
    const brand = brands.find((b) => b.id === entityId);
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
        },
      });

      if (!inWindow) {
        legs.push({
          entityId,
          channel: leg.channel,
          campaignId,
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
        leads: mappedLeads,
        sendEvents,
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

      const campaign: Campaign = {
        id: campaignId,
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

      const events = buildSendEvents({
        leads: eligible,
        entityId,
        campaignId,
        channel: leg.channel,
        messageFingerprint: fingerprint,
        mode: "auto",
      });

      await prisma.$transaction(async (tx) => {
        for (const lead of eligible) {
          const offered = lead.offeredEntityIds.includes(entityId)
            ? lead.offeredEntityIds
            : [...lead.offeredEntityIds, entityId];
          lead.offeredEntityIds = offered;
          lead.lastEntityId = entityId;
          lead.status = "contacted";
          await tx.lead.update({
            where: { id: lead.id },
            data: {
              offeredEntityIds: offered,
              lastEntityId: entityId,
              status: "contacted",
            },
          });
        }
        if (events.length) {
          await tx.leadSendEvent.createMany({
            data: events.map((e) => ({
              id: e.id,
              leadId: e.leadId,
              entityId: e.entityId,
              campaignId: e.campaignId,
              channel: e.channel,
              messageFingerprint: e.messageFingerprint,
              mode: e.mode,
              sentAt: new Date(e.sentAt),
            })),
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

      sendEvents = [...events, ...sendEvents];

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
        poolCursor,
      }),
    },
  });

  return { ranAt, nextRunAt, legs };
}

