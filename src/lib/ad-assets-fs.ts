import { put, get, del } from "@vercel/blob";
import { isProductionDeploy } from "@/lib/auth";
import { blobConfigured, requireProductionBlob } from "@/lib/uploads";
import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";

const ROOT = path.join(process.cwd(), ".data", "ad-assets");

/** Sanitize a single path segment (no traversal). */
export function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

/** Entity key for disk folders: shared | abstract | … */
export function entityStorageKey(brandId: string | null): string {
  return brandId ? safeSegment(brandId) : "shared";
}

export function absoluteAdAssetPath(storagePath: string): string {
  const resolved = path.resolve(ROOT, storagePath);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    throw new Error("Invalid asset path");
  }
  return resolved;
}

export async function ensureAdAssetsRoot(): Promise<string> {
  if (isProductionDeploy()) throw new Error("Local asset storage is disabled in production");
  await fs.mkdir(ROOT, { recursive: true });
  return ROOT;
}

export async function writeAdAssetFile(input: {
  brandId: string | null;
  originalName: string;
  buffer: Buffer;
}): Promise<{ storagePath: string; sizeBytes: number }> {
  requireProductionBlob();
  if (blobConfigured()) {
    const blob = await put(`ad-assets/${entityStorageKey(input.brandId)}/${randomBytes(16).toString("hex")}-${safeSegment(input.originalName)}`, input.buffer, { access: "private" });
    return { storagePath: `blob:${blob.pathname}`, sizeBytes: input.buffer.length };
  }
  await ensureAdAssetsRoot();
  const key = entityStorageKey(input.brandId);
  const dir = path.join(ROOT, key);
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(input.originalName).slice(0, 16);
  const base = safeSegment(path.basename(input.originalName, ext));
  const unique = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const filename = `${unique}-${base}${ext}`;
  const storagePath = `${key}/${filename}`;
  await fs.writeFile(path.join(ROOT, key, filename), input.buffer);
  return { storagePath, sizeBytes: input.buffer.length };
}

export async function readAdAssetFile(storagePath: string): Promise<Buffer> {
  if (storagePath.startsWith("blob:")) {
    const result = await get(storagePath.slice(5), { access: "private" });
    if (!result || result.statusCode !== 200) throw new Error("Asset not found");
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  if (isProductionDeploy()) throw new Error("Legacy local asset must be migrated to Blob");
  const abs = absoluteAdAssetPath(storagePath);
  return fs.readFile(abs);
}

export async function deleteAdAssetFile(storagePath: string): Promise<void> {
  if (storagePath.startsWith("blob:")) { await del(storagePath.slice(5)); return; }
  if (isProductionDeploy()) return;
  try {
    await fs.unlink(absoluteAdAssetPath(storagePath));
  } catch {
    // ignore missing files
  }
}

/** Seed helper: write a small text sample if missing. */
export async function writeSeedAdAssetFile(input: {
  brandId: string | null;
  relativeName: string;
  contents: string;
}): Promise<{ storagePath: string; sizeBytes: number }> {
  await ensureAdAssetsRoot();
  const key = entityStorageKey(input.brandId);
  const dir = path.join(ROOT, key);
  await fs.mkdir(dir, { recursive: true });
  const filename = safeSegment(input.relativeName);
  const storagePath = `${key}/${filename}`;
  const abs = path.join(dir, filename);
  const buffer = Buffer.from(input.contents, "utf8");
  await fs.writeFile(abs, buffer);
  return { storagePath, sizeBytes: buffer.length };
}
