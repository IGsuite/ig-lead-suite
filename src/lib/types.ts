export type CrmProvider =
  | "hubspot"
  | "salesforce"
  | "gohighlevel"
  | "pipedrive"
  | "custom";

export type BrandStatus = "setup" | "warming" | "live";
export type TenDlcStatus = "not_started" | "pending" | "approved";
export type EmailAuthStatus = "missing" | "partial" | "verified";
export type LeadStatus =
  | "available"
  | "queued"
  | "contacted"
  | "replied"
  | "opted_out"
  | "converted";
export type CampaignChannel = "sms" | "email";
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "paused"
  | "completed";
export type ReplySentiment =
  | "interested"
  | "neutral"
  | "not_interested"
  | "opt_out"
  | "other";

/** One company / program portal inside the shared backend. */
export interface Brand {
  id: string;
  name: string;
  shortName: string;
  /** What this entity sells — MCA, traditional financing, SEO, etc. */
  focus: string;
  programs: string[];
  domain: string;
  sendingSubdomain: string;
  websiteUrl: string;
  /** Future hook for that entity’s public site / CRM API. */
  websiteApiUrl: string;
  crm: CrmProvider;
  status: BrandStatus;
  phoneNumbers: string[];
  tenDlcStatus: TenDlcStatus;
  emailAuthStatus: EmailAuthStatus;
  weeklySendCap: number;
  /** Whether this entity is included in shared-pool offer rotation. */
  rotationEnabled: boolean;
  notes?: string;
}

export interface Lead {
  id: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  source: string;
  purchaseDate: string;
  costCents: number;
  /**
   * Shared pool: lead is never “owned” by one company.
   * Tracks which entity portals have already offered them.
   */
  offeredEntityIds: string[];
  lastEntityId: string | null;
  convertedEntityId: string | null;
  status: LeadStatus;
  optedOut: boolean;
  uploadBatchId?: string;
  createdAt: string;
}

export interface UploadBatch {
  id: string;
  filename: string;
  source: string;
  purchaseDate: string;
  costCents: number;
  rowCount: number;
  duplicateCount: number;
  importedCount: number;
  createdAt: string;
}

export interface Campaign {
  id: string;
  brandId: string;
  name: string;
  channel: CampaignChannel;
  subject?: string;
  message: string;
  sourceFilter: string | "all";
  /** Prefer leads not yet offered this entity (rotation). */
  preferUnoffered: boolean;
  volume: number;
  throttlePerHour: number;
  status: CampaignStatus;
  sentCount: number;
  replyCount: number;
  optOutCount: number;
  bounceCount: number;
  createdAt: string;
  startedAt?: string;
}

export interface Reply {
  id: string;
  campaignId: string;
  brandId: string;
  leadId: string;
  channel: CampaignChannel;
  from: string;
  body: string;
  sentiment: ReplySentiment;
  crmSynced: boolean;
  createdAt: string;
  read: boolean;
}

export interface OptOut {
  id: string;
  contact: string;
  channel: CampaignChannel | "both";
  reason: string;
  brandId: string | null;
  createdAt: string;
}

export interface ProviderSpend {
  source: string;
  leadsPurchased: number;
  costCents: number;
  replies: number;
  conversions: number;
}

export interface RotationConfig {
  mode: "round_robin" | "manual";
  /** Entity ids in rotation order for planning blasts. */
  entityOrder: string[];
  notes: string;
}

export interface PlatformData {
  version: number;
  brands: Brand[];
  leads: Lead[];
  uploads: UploadBatch[];
  campaigns: Campaign[];
  replies: Reply[];
  optOuts: OptOut[];
  providerSpend: ProviderSpend[];
  rotation: RotationConfig;
}
