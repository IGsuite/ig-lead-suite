import { normalizeRotation } from "@/lib/autopilot";
import type {
  AdAsset,
  AdFolder,
  Brand,
  Campaign,
  CampaignChannel,
  CampaignPoolMode,
  CostCategory,
  CostEntry,
  EntityDailyQuota,
  Lead,
  LeadSendEvent,
  MessageTemplate,
  OptOut,
  ProviderSpend,
  Reply,
  RotationConfig,
  SocialCampaign,
  SocialConnection,
  SocialConnectionStatus,
  SocialLinks,
  SocialPlatform,
  UploadBatch,
} from "@/lib/types";

export function normalizeSocialLinks(raw: unknown): SocialLinks {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const o = raw as Record<string, unknown>;
  const pick = (k: string) =>
    typeof o[k] === "string" && o[k].trim() ? String(o[k]).trim() : undefined;
  return {
    website: pick("website"),
    facebook: pick("facebook"),
    instagram: pick("instagram"),
    tiktok: pick("tiktok"),
    linkedin: pick("linkedin"),
    youtube: pick("youtube"),
    x: pick("x"),
    other: pick("other"),
  };
}

type EntityRow = {
  id: string;
  name: string;
  shortName: string;
  focus: string;
  programs: string[];
  domain: string;
  sendingSubdomain: string;
  websiteUrl: string;
  websiteApiUrl: string;
  crm: string;
  status: string;
  phoneNumbers: string[];
  tenDlcStatus: string;
  emailAuthStatus: string;
  weeklySendCap: number;
  rotationEnabled: boolean;
  socialLinks?: unknown;
  notes: string | null;
};

type LeadRow = {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  source: string;
  groupName: string;
  purchaseDate: Date;
  costCents: number;
  offeredEntityIds: string[];
  lastEntityId: string | null;
  convertedEntityId: string | null;
  status: string;
  optedOut: boolean;
  emailStatus: string;
  phoneStatus: string;
  verifyNotes: string | null;
  verifiedAt: Date | null;
  uploadBatchId: string | null;
  createdAt: Date;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function mapEntity(row: EntityRow): Brand {
  const links = normalizeSocialLinks(row.socialLinks);
  if (!links.website && row.websiteUrl) {
    links.website = row.websiteUrl;
  }
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    focus: row.focus,
    programs: row.programs,
    domain: row.domain,
    sendingSubdomain: row.sendingSubdomain,
    websiteUrl: row.websiteUrl,
    websiteApiUrl: row.websiteApiUrl,
    crm: row.crm as Brand["crm"],
    status: row.status as Brand["status"],
    phoneNumbers: row.phoneNumbers,
    tenDlcStatus: row.tenDlcStatus as Brand["tenDlcStatus"],
    emailAuthStatus: row.emailAuthStatus as Brand["emailAuthStatus"],
    weeklySendCap: row.weeklySendCap,
    rotationEnabled: row.rotationEnabled,
    socialLinks: links,
    notes: row.notes ?? undefined,
  };
}

export function mapLead(row: LeadRow): Lead {
  return {
    id: row.id,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    firstName: row.firstName ?? undefined,
    lastName: row.lastName ?? undefined,
    source: row.source,
    groupName: row.groupName,
    purchaseDate: isoDate(row.purchaseDate),
    costCents: row.costCents,
    offeredEntityIds: row.offeredEntityIds,
    lastEntityId: row.lastEntityId,
    convertedEntityId: row.convertedEntityId,
    status: row.status as Lead["status"],
    optedOut: row.optedOut,
    emailStatus: row.emailStatus as Lead["emailStatus"],
    phoneStatus: row.phoneStatus as Lead["phoneStatus"],
    verifyNotes: row.verifyNotes ?? undefined,
    verifiedAt: row.verifiedAt?.toISOString(),
    uploadBatchId: row.uploadBatchId ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapUpload(row: {
  id: string;
  filename: string;
  source: string;
  groupName: string;
  purchaseDate: Date;
  costCents: number;
  rowCount: number;
  duplicateCount: number;
  importedCount: number;
  createdAt: Date;
}): UploadBatch {
  return {
    id: row.id,
    filename: row.filename,
    source: row.source,
    groupName: row.groupName,
    purchaseDate: isoDate(row.purchaseDate),
    costCents: row.costCents,
    rowCount: row.rowCount,
    duplicateCount: row.duplicateCount,
    importedCount: row.importedCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapCampaign(row: {
  id: string;
  brandId: string;
  name: string;
  channel: string;
  subject: string | null;
  message: string;
  sourceFilter: string;
  groupFilter: string;
  preferUnoffered: boolean;
  preferVerified: boolean;
  mode?: string | null;
  volume: number;
  throttlePerHour: number;
  sendWindowPreset?: string | null;
  sendWindowStart?: string | null;
  sendWindowEnd?: string | null;
  timezone?: string | null;
  status: string;
  sentCount: number;
  replyCount: number;
  optOutCount: number;
  bounceCount: number;
  createdAt: Date;
  startedAt: Date | null;
}): Campaign {
  const mode: CampaignPoolMode =
    row.mode === "auto" || String(row.name || "").startsWith("Autopilot ·")
      ? "auto"
      : "own";
  return {
    id: row.id,
    brandId: row.brandId,
    name: row.name,
    channel: row.channel as Campaign["channel"],
    subject: row.subject ?? undefined,
    message: row.message,
    sourceFilter: row.sourceFilter,
    groupFilter: row.groupFilter,
    preferUnoffered: row.preferUnoffered,
    preferVerified: row.preferVerified,
    mode,
    volume: row.volume,
    throttlePerHour: row.throttlePerHour,
    sendWindowPreset: (row.sendWindowPreset ||
      "any") as Campaign["sendWindowPreset"],
    sendWindowStart: row.sendWindowStart ?? null,
    sendWindowEnd: row.sendWindowEnd ?? null,
    timezone: row.timezone || "America/New_York",
    status: row.status as Campaign["status"],
    sentCount: row.sentCount,
    replyCount: row.replyCount,
    optOutCount: row.optOutCount,
    bounceCount: row.bounceCount,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString(),
  };
}

export function mapLeadSendEvent(row: {
  id: string;
  leadId: string;
  entityId: string;
  campaignId: string;
  channel: string;
  messageFingerprint: string;
  mode: string;
  sentAt: Date;
}): LeadSendEvent {
  return {
    id: row.id,
    leadId: row.leadId,
    entityId: row.entityId,
    campaignId: row.campaignId,
    channel: row.channel as LeadSendEvent["channel"],
    messageFingerprint: row.messageFingerprint,
    mode: row.mode === "auto" ? "auto" : "own",
    sentAt: row.sentAt.toISOString(),
  };
}

export function mapReply(row: {
  id: string;
  campaignId: string;
  brandId: string;
  leadId: string;
  channel: string;
  from: string;
  body: string;
  sentiment: string;
  manualForwarded?: boolean;
  crmSynced: boolean;
  createdAt: Date;
  read: boolean;
}): Reply {
  return {
    id: row.id,
    campaignId: row.campaignId,
    brandId: row.brandId,
    leadId: row.leadId,
    channel: row.channel as Reply["channel"],
    from: row.from,
    body: row.body,
    sentiment: row.sentiment as Reply["sentiment"],
    manualForwarded: row.manualForwarded ?? false,
    crmSynced: row.crmSynced,
    createdAt: row.createdAt.toISOString(),
    read: row.read,
  };
}

export function mapOptOut(row: {
  id: string;
  contact: string;
  channel: string;
  reason: string;
  brandId: string | null;
  createdAt: Date;
}): OptOut {
  return {
    id: row.id,
    contact: row.contact,
    channel: row.channel as OptOut["channel"],
    reason: row.reason,
    brandId: row.brandId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapSpend(row: {
  source: string;
  leadsPurchased: number;
  costCents: number;
  replies: number;
  conversions: number;
}): ProviderSpend {
  return { ...row };
}

export function mapCostEntry(row: {
  id: string;
  brandId: string | null;
  category: string;
  label: string;
  vendor: string | null;
  amountCents: number;
  incurredAt: Date;
  notes: string | null;
  createdAt: Date;
}): CostEntry {
  return {
    id: row.id,
    brandId: row.brandId,
    category: row.category as CostCategory,
    label: row.label,
    vendor: row.vendor ?? undefined,
    amountCents: row.amountCents,
    incurredAt: row.incurredAt.toISOString().slice(0, 10),
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapMessageTemplate(row: {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  brandId: string | null;
  folderId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MessageTemplate {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel as CampaignChannel,
    subject: row.subject ?? undefined,
    body: row.body,
    brandId: row.brandId,
    folderId: row.folderId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapAdFolder(row: {
  id: string;
  name: string;
  brandId: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AdFolder {
  return {
    id: row.id,
    name: row.name,
    brandId: row.brandId,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapAdAsset(row: {
  id: string;
  brandId: string | null;
  folderId: string | null;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  createdAt: Date;
  updatedAt: Date;
}): AdAsset {
  return {
    id: row.id,
    brandId: row.brandId,
    folderId: row.folderId,
    name: row.name,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storagePath: row.storagePath,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapSocialCampaign(row: {
  id: string;
  entityId: string;
  platform: string;
  name: string;
  status: string;
  objective: string;
  budgetCents: number | null;
  dailyBudgetCents: number | null;
  targetingNotes: string | null;
  primaryText: string | null;
  cta: string | null;
  landingUrl: string | null;
  notes: string | null;
  creativeAssetId: string | null;
  creativeTemplateId: string | null;
  scheduleStart: Date | null;
  scheduleEnd: Date | null;
  impressions: number;
  clicks: number;
  leads: number;
  spendCents: number;
  createdAt: Date;
  updatedAt: Date;
}): SocialCampaign {
  return {
    id: row.id,
    entityId: row.entityId,
    platform: row.platform as SocialPlatform,
    name: row.name,
    status: row.status as SocialCampaign["status"],
    objective: row.objective || "",
    budgetCents: row.budgetCents,
    dailyBudgetCents: row.dailyBudgetCents,
    targetingNotes: row.targetingNotes ?? undefined,
    primaryText: row.primaryText ?? undefined,
    cta: row.cta ?? undefined,
    landingUrl: row.landingUrl ?? undefined,
    notes: row.notes ?? undefined,
    creativeAssetId: row.creativeAssetId,
    creativeTemplateId: row.creativeTemplateId,
    scheduleStart: row.scheduleStart
      ? row.scheduleStart.toISOString().slice(0, 10)
      : null,
    scheduleEnd: row.scheduleEnd
      ? row.scheduleEnd.toISOString().slice(0, 10)
      : null,
    impressions: row.impressions,
    clicks: row.clicks,
    leads: row.leads,
    spendCents: row.spendCents,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapSocialConnection(row: {
  id: string;
  entityId: string;
  platform: string;
  status: string;
  adAccountId: string | null;
  pixelOrEventsId: string | null;
  accessTokenNote: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SocialConnection {
  return {
    id: row.id,
    entityId: row.entityId,
    platform: row.platform as SocialPlatform,
    status: row.status as SocialConnectionStatus,
    adAccountId: row.adAccountId ?? undefined,
    pixelOrEventsId: row.pixelOrEventsId ?? undefined,
    accessTokenNote: row.accessTokenNote ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapRotation(
  row: {
    mode: string;
    entityOrder: string[];
    notes: string;
    autopilotEnabled?: boolean;
    autopilotJson?: unknown;
  },
  brands: Brand[] = [],
): RotationConfig {
  const json =
    row.autopilotJson && typeof row.autopilotJson === "object"
      ? (row.autopilotJson as {
          quotas?: EntityDailyQuota[];
          lastRunAt?: string;
          nextRunAt?: string;
          poolCursor?: number;
        })
      : {};
  return normalizeRotation(
    {
      mode: row.mode as RotationConfig["mode"],
      entityOrder: row.entityOrder,
      notes: row.notes,
      autopilotEnabled: row.autopilotEnabled ?? false,
      quotas: json.quotas,
      lastRunAt: json.lastRunAt,
      nextRunAt: json.nextRunAt,
      poolCursor: json.poolCursor ?? 0,
    },
    brands,
  );
}
