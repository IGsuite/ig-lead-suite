import { isNeonConfigured } from "@/lib/db";
import {
  isLeadEligibleForEntity,
  normalizeContact,
} from "@/lib/eligibility";
import * as jsonStore from "@/lib/json-store";
import * as neonStore from "@/lib/neon-store";
import type { AutopilotRunResult } from "@/lib/autopilot";
import { verifyContact } from "@/lib/verify";
import type {
  AdAsset,
  AdFolder,
  Brand,
  Campaign,
  CostEntry,
  Lead,
  MessageTemplate,
  OptOut,
  PlatformData,
  Reply,
  RotationConfig,
  SocialCampaign,
  SocialConnection,
  UploadBatch,
} from "@/lib/types";

export { isLeadEligibleForEntity };
export { isNeonConfigured };

export type CreateLeadResult =
  | { ok: true; lead: Lead }
  | {
      ok: false;
      code: "validation" | "opt_out" | "duplicate";
      error: string;
    };

function backend() {
  return isNeonConfigured() ? neonStore : jsonStore;
}

export function getStorageMode(): "neon" | "local" {
  return isNeonConfigured() ? "neon" : "local";
}

export async function getData(): Promise<PlatformData> {
  return backend().getData();
}

export async function resetData(): Promise<PlatformData> {
  return backend().resetData();
}

export async function updateBrand(
  id: string,
  patch: Partial<Brand>,
): Promise<Brand | null> {
  return backend().updateBrand(id, patch);
}

export async function updateRotation(
  patch: Partial<RotationConfig>,
): Promise<RotationConfig> {
  return backend().updateRotation(patch);
}

export async function importLeads(input: {
  filename: string;
  source: string;
  groupName?: string;
  purchaseDate: string;
  costCents: number;
  rows: Array<{
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  }>;
}): Promise<{ batch: UploadBatch; imported: Lead[]; duplicates: number }> {
  return backend().importLeads(input);
}

/** Create one lead in the shared pool (source defaults to Manual). */
export async function createLead(input: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  groupName?: string;
}): Promise<CreateLeadResult> {
  const email = input.email?.trim() || undefined;
  const phone = input.phone?.trim() || undefined;
  const firstName = input.firstName?.trim() || undefined;
  const lastName = input.lastName?.trim() || undefined;
  const source = input.source?.trim() || "Manual";
  const groupName = input.groupName?.trim() || "Manual";

  if (!email && !phone) {
    return {
      ok: false,
      code: "validation",
      error: "Phone or email is required",
    };
  }

  const verified = verifyContact({ email, phone });
  if (email && verified.emailStatus === "invalid") {
    return {
      ok: false,
      code: "validation",
      error: "Invalid email format",
    };
  }
  if (phone && verified.phoneStatus === "invalid") {
    return {
      ok: false,
      code: "validation",
      error: "Invalid phone number",
    };
  }

  const data = await getData();
  const emailNorm = email ? normalizeContact(email) : null;
  const phoneNorm = phone ? normalizeContact(phone) : null;

  for (const opt of data.optOuts) {
    const contact = normalizeContact(opt.contact);
    if (
      (emailNorm && contact === emailNorm) ||
      (phoneNorm && contact === phoneNorm)
    ) {
      return {
        ok: false,
        code: "opt_out",
        error: "Contact is on the global opt-out list",
      };
    }
  }

  for (const lead of data.leads) {
    if (
      emailNorm &&
      lead.email &&
      normalizeContact(lead.email) === emailNorm
    ) {
      return {
        ok: false,
        code: "duplicate",
        error: "A lead with this email already exists",
      };
    }
    if (
      phoneNorm &&
      lead.phone &&
      normalizeContact(lead.phone) === phoneNorm
    ) {
      return {
        ok: false,
        code: "duplicate",
        error: "A lead with this phone already exists",
      };
    }
  }

  const result = await importLeads({
    filename: "manual-entry",
    source,
    groupName,
    purchaseDate: new Date().toISOString().slice(0, 10),
    costCents: 0,
    rows: [{ email, phone, firstName, lastName }],
  });

  const lead = result.imported[0];
  if (!lead) {
    return {
      ok: false,
      code: "duplicate",
      error: "Lead could not be created (duplicate or opted out)",
    };
  }

  return { ok: true, lead };
}

export async function verifyLeads(input?: {
  leadIds?: string[];
  onlyUnverified?: boolean;
}): Promise<{ verified: number; invalid: number; risky: number }> {
  return backend().verifyLeads(input);
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
  return backend().createCampaign(input);
}

export async function launchCampaign(id: string) {
  return backend().launchCampaign(id);
}

export async function runAutopilotDay(): Promise<AutopilotRunResult> {
  return backend().runAutopilotDay();
}

export async function applyOptOut(input: {
  contact: string;
  channel: OptOut["channel"];
  reason: string;
  brandId?: string | null;
}): Promise<OptOut> {
  return backend().applyOptOut(input);
}

export async function markReply(
  id: string,
  patch: Partial<
    Pick<Reply, "read" | "crmSynced" | "sentiment" | "manualForwarded">
  >,
): Promise<Reply | null> {
  return backend().markReply(id, patch);
}

export async function ingestReply(input: {
  channel: Reply["channel"];
  from: string;
  body: string;
  brandId?: string;
  campaignId?: string;
  leadId?: string;
}): Promise<Reply> {
  return backend().ingestReply(input);
}

export async function createCostEntry(
  input: Omit<CostEntry, "id" | "createdAt">,
): Promise<CostEntry> {
  return backend().createCostEntry(input);
}

export async function deleteCostEntry(id: string): Promise<boolean> {
  return backend().deleteCostEntry(id);
}

export async function createMessageTemplate(
  input: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">,
): Promise<MessageTemplate> {
  return backend().createMessageTemplate(input);
}

export async function updateMessageTemplate(
  id: string,
  patch: Partial<
    Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">
  >,
): Promise<MessageTemplate | null> {
  return backend().updateMessageTemplate(id, patch);
}

export async function deleteMessageTemplate(id: string): Promise<boolean> {
  return backend().deleteMessageTemplate(id);
}

export async function createAdFolder(
  input: Omit<AdFolder, "id" | "createdAt" | "updatedAt">,
): Promise<AdFolder> {
  return backend().createAdFolder(input);
}

export async function updateAdFolder(
  id: string,
  patch: Partial<Omit<AdFolder, "id" | "createdAt" | "updatedAt">>,
): Promise<AdFolder | null> {
  return backend().updateAdFolder(id, patch);
}

export async function deleteAdFolder(id: string): Promise<boolean> {
  return backend().deleteAdFolder(id);
}

export async function createAdAsset(
  input: Omit<AdAsset, "id" | "createdAt" | "updatedAt">,
): Promise<AdAsset> {
  return backend().createAdAsset(input);
}

export async function updateAdAsset(
  id: string,
  patch: Partial<Omit<AdAsset, "id" | "createdAt" | "updatedAt">>,
): Promise<AdAsset | null> {
  return backend().updateAdAsset(id, patch);
}

export async function deleteAdAsset(id: string): Promise<boolean> {
  return backend().deleteAdAsset(id);
}

export async function createSocialCampaign(
  input: Omit<SocialCampaign, "id" | "createdAt" | "updatedAt">,
): Promise<SocialCampaign> {
  return backend().createSocialCampaign(input);
}

export async function updateSocialCampaign(
  id: string,
  patch: Partial<Omit<SocialCampaign, "id" | "createdAt" | "updatedAt">>,
): Promise<SocialCampaign | null> {
  return backend().updateSocialCampaign(id, patch);
}

export async function deleteSocialCampaign(id: string): Promise<boolean> {
  return backend().deleteSocialCampaign(id);
}

export async function upsertSocialConnection(
  input: Omit<SocialConnection, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
): Promise<SocialConnection> {
  return backend().upsertSocialConnection(input);
}

export function costPerReply(spend: {
  costCents: number;
  replies: number;
}): number | null {
  if (!spend.replies) return null;
  return Math.round(spend.costCents / spend.replies);
}
