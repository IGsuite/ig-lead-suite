import { promises as fs } from "fs";
import path from "path";
import { normalizeRotation } from "@/lib/autopilot";
import { normalizeSocialLinks } from "@/lib/mappers";
import {
  STORE_VERSION,
  createSeedData,
  materializeSeedAdAssets,
} from "@/lib/seed";
import type { PlatformData } from "@/lib/types";
import { normalizeSendWindow } from "@/lib/send-window";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "platform.json");

function softMigratePlatformData(parsed: PlatformData): PlatformData {
  if (!parsed.costEntries) parsed.costEntries = [];
  if (!Array.isArray(parsed.messageTemplates)) parsed.messageTemplates = [];
  if (!Array.isArray(parsed.adFolders)) parsed.adFolders = [];
  if (!Array.isArray(parsed.adAssets)) parsed.adAssets = [];
  if (!Array.isArray(parsed.socialCampaigns)) parsed.socialCampaigns = [];
  if (!Array.isArray(parsed.socialConnections)) parsed.socialConnections = [];
  if (!Array.isArray(parsed.sendEvents)) parsed.sendEvents = [];
  for (const t of parsed.messageTemplates) {
    if (t.folderId === undefined) t.folderId = null;
    if (t.brandId === undefined) t.brandId = null;
  }
  for (const f of parsed.adFolders) {
    if (f.brandId === undefined) f.brandId = null;
    if (f.parentId === undefined) f.parentId = null;
  }
  for (const a of parsed.adAssets) {
    if (a.brandId === undefined) a.brandId = null;
    if (a.folderId === undefined) a.folderId = null;
  }
  for (const b of parsed.brands || []) {
    b.socialLinks = normalizeSocialLinks({
      website: b.websiteUrl,
      ...b.socialLinks,
    });
  }
  for (const c of parsed.campaigns || []) {
    if (!c.sendWindowPreset) {
      Object.assign(c, normalizeSendWindow(c));
    }
    if (!c.mode) {
      c.mode =
        c.name?.startsWith("Autopilot ·") || c.id?.startsWith("camp-auto-")
          ? "auto"
          : "own";
    }
  }
  if (parsed.rotation && parsed.rotation.poolCursor == null) {
    parsed.rotation.poolCursor = 0;
  }
  return parsed;
}

export async function ensureStore(): Promise<PlatformData> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as PlatformData;
    if (parsed.version !== STORE_VERSION) {
      // Soft-bump when brands already exist — never wipe live CRM data.
      if (parsed.brands?.length) {
        softMigratePlatformData(parsed);
        parsed.version = STORE_VERSION;
        await writeStore(parsed);
        return parsed;
      }
      const seed = await materializeSeedAdAssets(createSeedData());
      await writeStore(seed);
      return seed;
    }
    softMigratePlatformData(parsed);
    return parsed;
  } catch {
    const seed = await materializeSeedAdAssets(createSeedData());
    await fs.writeFile(DATA_FILE, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
}

export async function writeStore(data: PlatformData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

