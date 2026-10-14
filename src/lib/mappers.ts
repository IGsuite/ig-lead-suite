import type {
  Brand,
  Campaign,
  Lead,
  OptOut,
  ProviderSpend,
  Reply,
  RotationConfig,
  UploadBatch,
} from "@/lib/types";

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
  notes: string | null;
};

type LeadRow = {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  source: string;
  purchaseDate: Date;
  costCents: number;
  offeredEntityIds: string[];
  lastEntityId: string | null;
  convertedEntityId: string | null;
  status: string;
  optedOut: boolean;
  uploadBatchId: string | null;
  createdAt: Date;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function mapEntity(row: EntityRow): Brand {
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
    purchaseDate: isoDate(row.purchaseDate),
    costCents: row.costCents,
    offeredEntityIds: row.offeredEntityIds,
    lastEntityId: row.lastEntityId,
    convertedEntityId: row.convertedEntityId,
    status: row.status as Lead["status"],
    optedOut: row.optedOut,
    uploadBatchId: row.uploadBatchId ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapUpload(row: {
  id: string;
  filename: string;
  source: string;
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
  preferUnoffered: boolean;
  volume: number;
  throttlePerHour: number;
  status: string;
  sentCount: number;
  replyCount: number;
  optOutCount: number;
  bounceCount: number;
  createdAt: Date;
  startedAt: Date | null;
}): Campaign {
  return {
    id: row.id,
    brandId: row.brandId,
    name: row.name,
    channel: row.channel as Campaign["channel"],
    subject: row.subject ?? undefined,
    message: row.message,
    sourceFilter: row.sourceFilter,
    preferUnoffered: row.preferUnoffered,
    volume: row.volume,
    throttlePerHour: row.throttlePerHour,
    status: row.status as Campaign["status"],
    sentCount: row.sentCount,
    replyCount: row.replyCount,
    optOutCount: row.optOutCount,
    bounceCount: row.bounceCount,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString(),
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

export function mapRotation(row: {
  mode: string;
  entityOrder: string[];
  notes: string;
}): RotationConfig {
  return {
    mode: row.mode as RotationConfig["mode"],
    entityOrder: row.entityOrder,
    notes: row.notes,
  };
}
