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

export interface Brand {
  id: string;
  name: string;
  domain: string;
  sendingSubdomain: string;
  crm: CrmProvider;
  status: BrandStatus;
  phoneNumbers: string[];
  tenDlcStatus: TenDlcStatus;
  emailAuthStatus: EmailAuthStatus;
  weeklySendCap: number;
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
  brandId: string | null;
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

export interface PlatformData {
  brands: Brand[];
  leads: Lead[];
  uploads: UploadBatch[];
  campaigns: Campaign[];
  replies: Reply[];
  optOuts: OptOut[];
  providerSpend: ProviderSpend[];
}
