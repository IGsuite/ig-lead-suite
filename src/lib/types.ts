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
export type VerifyStatus = "unverified" | "valid" | "invalid" | "risky";
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
export type SendWindowPreset =
  | "morning"
  | "afternoon"
  | "evening"
  | "custom"
  | "any";
export type UserRole = "admin" | "member";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  /** Empty + admin = all entities. Member must list portals they can open. */
  allowedEntityIds: string[];
  createdAt: string;
}

export type AppUserPublic = Omit<AppUser, "passwordHash">;

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
  groupName: string;
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
  emailStatus: VerifyStatus;
  phoneStatus: VerifyStatus;
  verifyNotes?: string;
  verifiedAt?: string;
  uploadBatchId?: string;
  createdAt: string;
}

export interface UploadBatch {
  id: string;
  filename: string;
  source: string;
  groupName: string;
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
  groupFilter: string | "all";
  preferUnoffered: boolean;
  preferVerified: boolean;
  volume: number;
  throttlePerHour: number;
  /** When sends are allowed (local time in `timezone`). */
  sendWindowPreset: SendWindowPreset;
  sendWindowStart?: string | null;
  sendWindowEnd?: string | null;
  timezone: string;
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
  /** Manual “good lead — emailed/forwarded to team” until CRM API is live. */
  manualForwarded: boolean;
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

/** Operating / send / setup spend tracked for ROI. */
export type CostCategory =
  | "sms"
  | "email"
  | "leads"
  | "setup"
  | "integration"
  | "other";

export interface CostEntry {
  id: string;
  /** null = shared overhead across all entities */
  brandId: string | null;
  category: CostCategory;
  label: string;
  vendor?: string;
  amountCents: number;
  incurredAt: string;
  notes?: string;
  createdAt: string;
}

export interface EntityCostRollup {
  brandId: string | null;
  brandName: string;
  byCategory: Record<CostCategory, number>;
  totalCents: number;
  replies: number;
  interested: number;
  conversions: number;
  costPerReply: number | null;
  costPerInterested: number | null;
}

/** Daily send quota for one entity on the Ferris-wheel autopilot. */
export interface EntityDailyQuota {
  entityId: string;
  dailyEmailVolume: number;
  dailySmsVolume: number;
  enabled: boolean;
  /** Preferred send window for Autopilot legs (defaults to any). */
  sendWindowPreset?: SendWindowPreset;
  sendWindowStart?: string | null;
  sendWindowEnd?: string | null;
  timezone?: string;
}

export interface RotationConfig {
  mode: "round_robin" | "manual";
  /** Entity ids in rotation order for planning blasts. */
  entityOrder: string[];
  notes: string;
  /** When on, SignalDesk rotates the shared pool through each portal daily. */
  autopilotEnabled: boolean;
  quotas: EntityDailyQuota[];
  lastRunAt?: string;
  nextRunAt?: string;
}

/** Source performance for one entity portal. */
export interface EntitySourceResult {
  source: string;
  groupName?: string;
  offered: number;
  replies: number;
  interested: number;
  conversions: number;
  costCents: number;
  costPerReply: number | null;
  recommendation: "scale_up" | "hold" | "cut";
}

/** Reply performance bucketed by local time-of-day. */
export interface TimeOfDayResult {
  bucket: "morning" | "afternoon" | "evening" | "night";
  label: string;
  replies: number;
  interested: number;
  optOuts: number;
  interestedRate: number | null;
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
  costEntries: CostEntry[];
  rotation: RotationConfig;
}
