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
/** Filter for reports / analytics. `"all"` keeps both channels visible. */
export type ChannelFilter = CampaignChannel | "all";
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

/** Paid social platforms managed per entity portal. */
export type SocialPlatform = "meta" | "tiktok";
export type SocialCampaignStatus =
  | "draft"
  | "active"
  | "paused"
  | "archived";
export type SocialConnectionStatus =
  | "not_connected"
  | "connected"
  | "needs_setup";

/** Per-entity Meta / TikTok campaign (planning + metrics placeholders). */
export interface SocialCampaign {
  id: string;
  entityId: string;
  platform: SocialPlatform;
  name: string;
  status: SocialCampaignStatus;
  objective: string;
  budgetCents?: number | null;
  dailyBudgetCents?: number | null;
  targetingNotes?: string;
  primaryText?: string;
  cta?: string;
  landingUrl?: string;
  notes?: string;
  /** Optional Ads library file. */
  creativeAssetId?: string | null;
  /** Optional Ads library message template. */
  creativeTemplateId?: string | null;
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  impressions: number;
  clicks: number;
  leads: number;
  spendCents: number;
  createdAt: string;
  updatedAt: string;
}

/** Per-entity platform connection (local/mock until real OAuth). */
export interface SocialConnection {
  id: string;
  entityId: string;
  platform: SocialPlatform;
  status: SocialConnectionStatus;
  adAccountId?: string;
  pixelOrEventsId?: string;
  accessTokenNote?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

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

/** Folder in an entity (or shared) Ads library. */
export interface AdFolder {
  id: string;
  name: string;
  /** null = shared across entities; otherwise one portal. */
  brandId: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Uploaded marketing file — bytes under `.data/ad-assets/`. */
export interface AdAsset {
  id: string;
  /** null = shared across entities; otherwise one portal. */
  brandId: string | null;
  folderId: string | null;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  /** Relative path under `.data/ad-assets/`. */
  storagePath: string;
  createdAt: string;
  updatedAt: string;
}

/** Reusable SMS / email blast copy (Ads library). */
export interface MessageTemplate {
  id: string;
  name: string;
  channel: CampaignChannel;
  subject?: string;
  body: string;
  /** null = shared across entities; otherwise one portal. */
  brandId: string | null;
  /** Optional folder within that entity's Ads library. */
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
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
  /** Leads with a phone number (SMS-capable). */
  phoneCapable: number;
  /** Leads with an email address (email-capable). */
  emailCapable: number;
  replies: number;
  /** Reply counts by channel when data allows. */
  smsReplies: number;
  emailReplies: number;
  interested: number;
  conversions: number;
  costCents: number;
  costPerReply: number | null;
  recommendation: "scale_up" | "hold" | "cut";
  /** Which channel this row is scoped to (`all` = combined). */
  channel: ChannelFilter;
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

/** Per-entity (or pool) scorecard rates for overview widgets. */
export interface EntityPerformanceScores {
  brandId: string | null;
  brandName: string;
  shortName: string;
  /** Channel this scorecard is scoped to. */
  channel: ChannelFilter;
  offered: number;
  sent: number;
  replies: number;
  interested: number;
  conversions: number;
  optOuts: number;
  spendCents: number;
  /** Replies / sent (or offered when no sends). 0–100. */
  replyRate: number | null;
  /** Interested / replies. 0–100. */
  interestedRate: number | null;
  /** Conversions / offered. 0–100. */
  conversionRate: number | null;
  /** Lower cost-per-interested is better; null if none. */
  costPerInterested: number | null;
  /** 0–100 efficiency score vs peers (higher = cheaper interested). */
  costEfficiencyScore: number | null;
}

/** Campaign copy ranked by reply / interested performance. */
export interface CampaignMessageResult {
  campaignId: string;
  brandId: string;
  brandName: string;
  name: string;
  channel: CampaignChannel;
  message: string;
  subject?: string;
  sent: number;
  replies: number;
  interested: number;
  optOuts: number;
  replyRate: number | null;
  interestedRate: number | null;
  rank: number;
  recommendation: "scale_up" | "hold" | "cut";
}

/** One-line improve insight combining source + timing + message. */
export interface EntityImprovementInsight {
  brandId: string | null;
  brandName: string;
  channel: ChannelFilter;
  bestSource: EntitySourceResult | null;
  worstSource: EntitySourceResult | null;
  bestTiming: TimeOfDayResult | null;
  bestMessage: CampaignMessageResult | null;
  scores: EntityPerformanceScores;
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
  messageTemplates: MessageTemplate[];
  adFolders: AdFolder[];
  adAssets: AdAsset[];
  socialCampaigns: SocialCampaign[];
  socialConnections: SocialConnection[];
  rotation: RotationConfig;
}
