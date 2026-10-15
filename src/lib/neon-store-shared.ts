import {
  entityOfferCopy,
  normalizeRotation,
  tomorrowIso,
  type AutopilotRunResult,
} from "@/lib/autopilot";
import { getPrisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
import { normalizeContact } from "@/lib/eligibility";
import { deleteAdAssetFile } from "@/lib/ad-assets-fs";
import {
  mapAdAsset,
  mapAdFolder,
  mapCampaign,
  mapCostEntry,
  mapEntity,
  mapLead,
  mapLeadSendEvent,
  mapMessageTemplate,
  mapOptOut,
  mapReply,
  mapRotation,
  mapSocialCampaign,
  mapSocialConnection,
  mapSpend,
  mapUpload,
  normalizeSocialLinks,
} from "@/lib/mappers";
import {
  STORE_VERSION,
  createSeedData,
  materializeSeedAdAssets,
} from "@/lib/seed";
import {
  buildSendEvents,
  messageFingerprint,
  selectLeadsForSend,
} from "@/lib/rotation-select";
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
import { deliverCampaignBatch } from "@/lib/send";
import {
  isWithinSendWindow,
  normalizeSendWindow,
  sendWindowLabel,
} from "@/lib/send-window";
import { applyVerification } from "@/lib/verify";

export type LaunchResult = {
  campaign: Campaign;
  deferred: boolean;
  reason?: string;
  windowLabel?: string;
};

export function isMissingCollectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    /does not exist/i.test(msg) ||
    /\bP2021\b/.test(msg) ||
    /Cannot read properties of undefined/i.test(msg) ||
    /missing Ads\/auth model delegates/i.test(msg)
  );
}

export async function safeFindMany<T>(
  run: () => Promise<T[]>,
  label: string,
): Promise<T[]> {
  try {
    return await run();
  } catch (err) {
    if (!isMissingCollectionError(err)) throw err;
    console.warn(
      `[neon-store] ${label} unavailable; returning []:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}


export function guessSentiment(body: string): Reply["sentiment"] {
  const t = body.toLowerCase();
  if (/\bstop\b|\bunsubscribe\b|\bopt.?out\b/.test(t)) return "opt_out";
  if (/\byes\b|\binterested\b|\bcall me\b|\bsend (me )?rates\b|\binfo\b/.test(t))
    return "interested";
  if (/\bno\b|\bnot interested\b|\balready funded\b/.test(t))
    return "not_interested";
  if (/\bwho is this\b|\?\s*$/.test(t)) return "neutral";
  return "other";
}

