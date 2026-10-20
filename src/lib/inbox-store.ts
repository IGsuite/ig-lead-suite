import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getPrisma, isNeonConfigured } from "@/lib/db";
import { ensureStore, writeStore } from "@/lib/json-store-io";
import { normalizeContact } from "@/lib/eligibility";
import { mapReply } from "@/lib/mappers";
import type { InboundReply } from "@/lib/reply-routing";
import type { InboxSend, Reply } from "@/lib/types";
import { conversationKey } from "@/lib/conversation-key";
import { isProductionDeploy } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";

function assertStorage() {
  if (isProductionDeploy() && !isNeonConfigured()) throw new Error("Production inbox requires the configured database");
}

// The JSON backend is for a single local process; production uses Postgres locks.
let pending: Promise<unknown> = Promise.resolve();
function localLock<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work);
  pending = result.catch(() => undefined);
  return result;
}

function sentiment(body: string): Reply["sentiment"] {
  const text = body.toLowerCase();
  if (/\bstop\b|\bunsubscribe\b|\bopt.?out\b/.test(text)) return "opt_out";
  if (/\bnot interested\b|\balready funded\b|^no\b/.test(text)) return "not_interested";
  if (/\byes\b|\binterested\b|\bcall me\b|\bsend (me )?rates\b|\binfo\b/.test(text)) return "interested";
  return /\?\s*$/.test(text) ? "neutral" : "other";
}

export async function saveInbound(input: InboundReply, client?: Prisma.TransactionClient): Promise<Reply> {
  assertStorage();
  const id = input.id || `reply-${randomUUID()}`;
  const contact = normalizeContact(input.from);
  const kind = sentiment(input.body);
  if (client || isNeonConfigured()) {
    const persist = async (tx: Prisma.TransactionClient) => {
      // Serialize retries and simultaneous first replies for the same contact.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${contact}))`;
      const existing = await tx.reply.findUnique({ where: { id } });
      if (existing) return mapReply(existing);
      if (!await tx.entity.findUnique({ where: { id: input.brandId } })) throw new Error("Unknown entity");
      const leads = await tx.lead.findMany({ where: input.channel === "email"
        ? { email: { equals: input.from, mode: "insensitive" } } : { phone: { not: null } } });
      let lead = leads.find((l) => normalizeContact(input.channel === "email" ? l.email || "" : l.phone || "") === contact);
      if (!lead) lead = await tx.lead.create({ data: {
        id: `lead-inbound-${randomUUID()}`, email: input.channel === "email" ? input.from : null,
        phone: input.channel === "sms" ? input.from : null, source: "Inbound reply", groupName: "Inbound",
        purchaseDate: new Date(), costCents: 0, offeredEntityIds: [input.brandId], lastEntityId: input.brandId,
        status: "replied", emailStatus: input.channel === "email" ? "valid" : "unverified",
        phoneStatus: input.channel === "sms" ? "valid" : "unverified",
      } });
      const campaign = input.campaignId ? await tx.campaign.findFirst({ where: {
        id: input.campaignId, brandId: input.brandId, channel: input.channel,
      } }) : null;
      if (input.campaignId && !campaign) throw new Error("Campaign does not belong to this entity and channel");
      // Do not attribute an external reply to an arbitrary local campaign.
      const campaignId = campaign?.id || `camp-inbound-${input.brandId}-${input.channel}`;
      if (!campaign) await tx.campaign.upsert({ where: { id: campaignId }, update: {}, create: {
        id: campaignId, brandId: input.brandId, channel: input.channel, name: "Inbound conversations",
        message: "(inbound)", status: "completed", volume: 0, throttlePerHour: 1,
      } });
      const row = await tx.reply.create({ data: {
        id, campaignId, brandId: input.brandId, leadId: lead.id, channel: input.channel,
        from: input.from, body: input.body, sentiment: kind, providerContext: { ...input.providerContext },
      } });
      await tx.lead.update({ where: { id: lead.id }, data: {
        lastEntityId: input.brandId, status: lead.optedOut || kind === "opt_out" ? "opted_out" : "replied",
        ...(kind === "opt_out" ? { optedOut: true } : {}),
      } });
      await tx.campaign.update({ where: { id: campaignId }, data: { replyCount: { increment: 1 } } });
      return mapReply(row);
    };
    return client ? persist(client) : getPrisma().$transaction(persist, { timeout: 20_000 });
  }
  return localLock(async () => {
    const data = await ensureStore();
    const existing = data.replies.find((r) => r.id === id);
    if (existing) return existing;
    if (!data.brands.some((b) => b.id === input.brandId)) throw new Error("Unknown entity");
    const campaign = input.campaignId ? data.campaigns.find((c) => c.id === input.campaignId && c.brandId === input.brandId && c.channel === input.channel) : undefined;
    if (input.campaignId && !campaign) throw new Error("Campaign does not belong to this entity and channel");
    let lead = data.leads.find((l) => normalizeContact(input.channel === "email" ? l.email || "" : l.phone || "") === contact);
    if (!lead) {
      lead = { id: `lead-inbound-${randomUUID()}`, email: input.channel === "email" ? input.from : undefined,
        phone: input.channel === "sms" ? input.from : undefined, source: "Inbound reply", groupName: "Inbound",
        purchaseDate: new Date().toISOString().slice(0, 10), costCents: 0, offeredEntityIds: [input.brandId],
        lastEntityId: input.brandId, convertedEntityId: null, status: "replied", optedOut: false,
        emailStatus: input.channel === "email" ? "valid" : "unverified", phoneStatus: input.channel === "sms" ? "valid" : "unverified",
        createdAt: new Date().toISOString() };
      data.leads.unshift(lead);
    }
    const reply: Reply = { id, brandId: input.brandId, campaignId: campaign?.id || `camp-inbound-${input.brandId}-${input.channel}`,
      leadId: lead.id, channel: input.channel, from: input.from, body: input.body, sentiment: kind,
      manualForwarded: false, crmSynced: false, read: false, createdAt: new Date().toISOString(), providerContext: input.providerContext };
    if (kind === "opt_out") lead.optedOut = true;
    lead.status = lead.optedOut ? "opted_out" : "replied";
    lead.lastEntityId = input.brandId;
    data.replies.unshift(reply);
    if (campaign) campaign.replyCount++;
    await writeStore(data);
    return reply;
  });
}

const sendsFile = () => path.join(process.cwd(), ".data", "inbox-sends.json");
async function readSends(): Promise<InboxSend[]> {
  try { return JSON.parse(await fs.readFile(sendsFile(), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
async function writeSends(rows: InboxSend[]) {
  await fs.mkdir(path.dirname(sendsFile()), { recursive: true });
  const temp = `${sendsFile()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(rows, null, 2));
  await fs.rename(temp, sendsFile());
}
function mapSend(row: { createdAt: Date; [key: string]: unknown }): InboxSend {
  return { ...row, createdAt: row.createdAt.toISOString(), providerId: row.providerId || undefined, error: row.error || undefined } as InboxSend;
}
export async function listInboxSends(reply: Reply, replies: Reply[] = [reply]): Promise<InboxSend[]> {
  assertStorage();
  const ids = replies.filter((r) => conversationKey(r) === conversationKey(reply)).map((r) => r.id);
  if (isNeonConfigured()) return (await getPrisma().inboxSend.findMany({ where: {
    brandId: reply.brandId, leadId: reply.leadId, channel: reply.channel, replyId: { in: ids },
  }, orderBy: { createdAt: "asc" } })).map(mapSend);
  return (await readSends()).filter((s) => s.brandId === reply.brandId && s.leadId === reply.leadId && s.channel === reply.channel && ids.includes(s.replyId));
}
export async function reserveInboxSend(send: InboxSend): Promise<{ send: InboxSend; created: boolean }> {
  assertStorage();
  if (isNeonConfigured()) {
    const result = await getPrisma().inboxSend.createMany({ data: [{ ...send, createdAt: new Date(send.createdAt) }], skipDuplicates: true });
    const row = await getPrisma().inboxSend.findUniqueOrThrow({ where: { id: send.id } });
    return { send: mapSend(row), created: result.count === 1 };
  }
  return localLock(async () => {
    const rows = await readSends();
    const existing = rows.find((s) => s.id === send.id);
    if (existing) return { send: existing, created: false };
    rows.push(send); await writeSends(rows);
    return { send, created: true };
  });
}
export async function finishInboxSend(id: string, patch: Pick<InboxSend, "status" | "error" | "providerId">): Promise<InboxSend> {
  assertStorage();
  if (isNeonConfigured()) {
    if (patch.status === "accepted" && patch.providerId) {
      const receipt = await getPrisma().deliveryReceipt.findUnique({ where: { providerId: patch.providerId } });
      if (receipt && ["delivered", "failed"].includes(receipt.status)) patch = { ...patch, status: receipt.status as "delivered" | "failed" };
    }
    return mapSend(await getPrisma().inboxSend.update({ where: { id }, data: patch }));
  }
  return localLock(async () => {
    const rows = await readSends(); const row = rows.find((s) => s.id === id);
    if (!row) throw new Error("Send record not found");
    Object.assign(row, patch); await writeSends(rows); return row;
  });
}
