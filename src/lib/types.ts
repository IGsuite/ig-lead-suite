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
  | "completed"
  | "cancelled";
/** Auto = shared-pool Ferris wheel; Own = standalone entity campaign. */
export type CampaignPoolMode = "auto" | "own";
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
export type UserRole = "admin" | "member" | "setup";

/** Public social / brand page links for an entity hub. */
export interface SocialLinks {
  website?: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  linkedin?: string;
  youtube?: string;
  x?: string;
  other?: string;
}

/**
 * Durable send / assignment history for fair pool rotation.
 * Blocks re-sending the same message fingerprint too soon.
 */
export interface LeadSendEvent {
  id: string;
  leadId: string;
  entityId: string;
  campaignId: string;
  channel: CampaignChannel;
  messageFingerprint: string;
  mode?: CampaignPoolMode;
  sentAt: string;
}

/** Paid social platforms managed per entity portal. */
export type SocialPlatform = "meta" | "tiktok" | "google_ads" | "seo";
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
  /** Brand social page links shown on Social Media / entity hub. */
  socialLinks?: SocialLinks;
  notes?: string;
}

export interface SmsConsent {
  id: string;
  brandId: string;
  phone: string;
  status: "granted" | "revoked";
  recordedAt: string;
  sourceUrl: string;
  disclosure: string;
  disclosureVersion: string;
  method: "web_form" | "operator";
  recordedBy?: string;
}

export interface Lead {
  manualPackages?: Array<{id:string;name:string}>;
  id: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  /** Company / DBA / merchant name. */
  businessName?: string;
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
  smsConsents?: SmsConsent[];
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
  /** Canonical program name from this company's program catalog. */
  programs?: string[];
  name: string;
  channel: CampaignChannel;
  subject?: string;
  message: string;
  /** Optional HTML override for email; when unset, HTML is built from message + image. */
  htmlMessage?: string | null;
  /** Public image URL for HTML email only (plain-text fallback omits it). */
  imageUrl?: string | null;
  imageAlt?: string | null;
  sourceFilter: string | "all";
  groupFilter: string | "all";
  preferUnoffered: boolean;
  preferVerified: boolean;
  /** Auto wheel leg vs standalone Own campaign. */
  mode: CampaignPoolMode;
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
  programs?: string[];
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
  providerContext?: ReplyContext;
}

export interface ReplyContext {
  provider?: "smartlead" | "telnyx";
  campaignId?: string;
  leadId?: string;
  messageId?: string;
  emailStatsId?: string;
  mailbox?: string;
  subject?: string;
  receivedAt?: string;
}

export interface InboxSend {
  id: string;
  replyId: string;
  brandId: string;
  leadId: string;
  channel: CampaignChannel;
  body: string;
  from: string;
  to: string;
  status: "sending" | "accepted" | "delivered" | "failed" | "unknown";
  providerId?: string;
  error?: string;
  createdAt: string;
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
  /**
   * Cursor into the fair-ordered eligible pool for Auto wheel walks.
   * Advances after each Autopilot pass so the same slice is not reused daily.
   */
  poolCursor?: number;
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

export interface LeadPoolSummary {
  total: number; fresh: number; suppressed: number;
  sources: string[]; groups: string[]; packages: {id:string;name:string;count:number}[];
  byBrand: Record<string,{offered:number;open:number;conversions:number}>;
  rollups: {brandId:string;source:string;channel:ChannelFilter;offered:number;phoneCapable:number;emailCapable:number;conversions:number;costCents:number}[];
}
export interface PlatformData {
  leadSummary?: LeadPoolSummary;
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
  socialCampaigns?: SocialCampaign[];
  socialConnections?: SocialConnection[];
  /** Durable send history for Auto wheel / Own campaign rotation. */
  sendEvents?: LeadSendEvent[];
  rotation: RotationConfig;
}
