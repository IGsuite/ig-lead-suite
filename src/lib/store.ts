import { isNeonConfigured } from "@/lib/db";
import { isLeadEligibleForEntity } from "@/lib/eligibility";
import * as jsonStore from "@/lib/json-store";
import * as neonStore from "@/lib/neon-store";
import type { AutopilotRunResult } from "@/lib/autopilot";
import type {
  Brand,
  Campaign,
  CostEntry,
  Lead,
  OptOut,
  PlatformData,
  Reply,
  RotationConfig,
  UploadBatch,
} from "@/lib/types";

export { isLeadEligibleForEntity };
export { isNeonConfigured };

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

export function costPerReply(spend: {
  costCents: number;
  replies: number;
}): number | null {
  if (!spend.replies) return null;
  return Math.round(spend.costCents / spend.replies);
}
