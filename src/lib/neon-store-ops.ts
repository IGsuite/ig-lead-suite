import { randomUUID } from "node:crypto";
import { enqueueCampaign } from "@/lib/send-queue";
import type { AutopilotRunResult } from "@/lib/autopilot";
import { getPrisma } from "@/lib/db";
import { normalizeContact } from "@/lib/eligibility";
import {
  mapCampaign,
  mapCostEntry,
  mapOptOut,
  mapReply,
} from "@/lib/mappers";
import type {
  Campaign,
  CostEntry,
  OptOut,
  Reply,
} from "@/lib/types";
import {
  normalizeSendWindow,
} from "@/lib/send-window";
import {
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
      id: `camp-${randomUUID()}`,
      brandId: input.brandId,
      programs: input.programs ?? [],
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
      status: "draft",
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
  const updated = await prisma.$transaction(async tx => {
    const row = await tx.campaign.update({ where: { id }, data: { status } });
    if (id.startsWith("camp-calendar-") && ["paused","cancelled"].includes(status)) {
      await tx.marketingCalendarEntry.updateMany({where:{runCampaignId:id},data:{status:"paused"}});
    }
    if (status === "cancelled") {
      await tx.sendJob.updateMany({ where: { campaignId: id, status: "queued" }, data: { status: "skipped", error: "Campaign cancelled", finishedAt: new Date() } });
    }
    return row;
  });
  return mapCampaign(updated);
}

export async function launchCampaign(id: string): Promise<LaunchResult | null> {
  const result = await enqueueCampaign(id);
  const { wakeDispatcher } = await import("@/lib/dispatch-scheduler");
  await wakeDispatcher();
  return result;
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

export { saveInbound as ingestReply } from "@/lib/inbox-store";

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
  const { scheduleAutopilot } = await import("@/lib/send-queue");
  return scheduleAutopilot(true);
}
