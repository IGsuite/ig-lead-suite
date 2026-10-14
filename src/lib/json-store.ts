import { promises as fs } from "fs";
import path from "path";
import { isLeadEligibleForEntity, normalizeContact } from "@/lib/eligibility";
import { STORE_VERSION, createSeedData } from "@/lib/seed";
import type {
  Brand,
  Campaign,
  Lead,
  OptOut,
  PlatformData,
  Reply,
  RotationConfig,
  UploadBatch,
} from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "platform.json");

async function ensureStore(): Promise<PlatformData> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as PlatformData;
    if (parsed.version !== STORE_VERSION) {
      const seed = createSeedData();
      await writeStore(seed);
      return seed;
    }
    return parsed;
  } catch {
    const seed = createSeedData();
    await fs.writeFile(DATA_FILE, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
}

async function writeStore(data: PlatformData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function getData(): Promise<PlatformData> {
  return ensureStore();
}

export async function resetData(): Promise<PlatformData> {
  const seed = createSeedData();
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
  data.rotation = { ...data.rotation, ...patch };
  await writeStore(data);
  return data.rotation;
}

export async function importLeads(input: {
  filename: string;
  source: string;
  purchaseDate: string;
  costCents: number;
  rows: Array<{
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  }>;
}): Promise<{ batch: UploadBatch; imported: Lead[]; duplicates: number }> {
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

    const lead: Lead = {
      id: `lead-${Date.now()}-${imported.length}`,
      email: row.email?.trim() || undefined,
      phone: row.phone?.trim() || undefined,
      firstName: row.firstName?.trim() || undefined,
      lastName: row.lastName?.trim() || undefined,
      source: input.source,
      purchaseDate: input.purchaseDate,
      costCents: costPerLead,
      offeredEntityIds: [],
      lastEntityId: null,
      convertedEntityId: null,
      status: "available",
      optedOut: false,
      uploadBatchId: batchId,
      createdAt: new Date().toISOString(),
    };
    imported.push(lead);
    if (emailKey) existingKeys.add(emailKey);
    if (phoneKey) existingKeys.add(phoneKey);
  }

  const batch: UploadBatch = {
    id: batchId,
    filename: input.filename,
    source: input.source,
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
  const campaign: Campaign = {
    ...input,
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

export async function launchCampaign(id: string): Promise<Campaign | null> {
  const data = await ensureStore();
  const campaign = data.campaigns.find((c) => c.id === id);
  if (!campaign) return null;

  const eligible = data.leads
    .filter((lead) =>
      isLeadEligibleForEntity(lead, campaign.brandId, {
        channel: campaign.channel,
        sourceFilter: campaign.sourceFilter,
        preferUnoffered: campaign.preferUnoffered,
      }),
    )
    .sort((a, b) => a.offeredEntityIds.length - b.offeredEntityIds.length);

  const toSend = eligible.slice(0, campaign.volume);
  for (const lead of toSend) {
    if (!lead.offeredEntityIds.includes(campaign.brandId)) {
      lead.offeredEntityIds.push(campaign.brandId);
    }
    lead.lastEntityId = campaign.brandId;
    lead.status = "contacted";
  }

  campaign.status = "sending";
  campaign.sentCount = toSend.length;
  campaign.startedAt = new Date().toISOString();
  await writeStore(data);
  return campaign;
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
  patch: Partial<Pick<Reply, "read" | "crmSynced" | "sentiment">>,
): Promise<Reply | null> {
  const data = await ensureStore();
  const reply = data.replies.find((r) => r.id === id);
  if (!reply) return null;
  Object.assign(reply, patch);

  if (patch.sentiment === "interested" || reply.sentiment === "interested") {
    const lead = data.leads.find((l) => l.id === reply.leadId);
    if (lead) lead.status = "replied";
  }

  await writeStore(data);
  return reply;
}
