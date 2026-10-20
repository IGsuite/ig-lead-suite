import { createHash, createPublicKey, timingSafeEqual, verify } from "crypto";
import { getPrisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export function validEmailWebhook(request: Request): boolean {
  const secret = process.env.EMAIL_WEBHOOK_SECRET?.trim();
  if (!secret || secret.length < 32) return false;
  const provided = request.headers.get("x-webhook-secret") || request.headers.get("authorization")?.replace(/^Bearer /, "") || new URL(request.url).searchParams.get("token") || "";
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function validTelnyxWebhook(raw: string, headers: Headers, now = Date.now()): boolean {
  try {
    const key = process.env.TELNYX_PUBLIC_KEY?.trim();
    const timestamp = headers.get("telnyx-timestamp");
    const signature = headers.get("telnyx-signature-ed25519");
    if (!key || !timestamp || !signature || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
    const publicKey = key.includes("BEGIN PUBLIC KEY") ? createPublicKey(key.replace(/\\n/g, "\n")) : createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(key, "base64")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(`${timestamp}|${raw}`), publicKey, Buffer.from(signature, "base64"));
  } catch { return false; }
}
/** Receipt and state changes commit together. Concurrent delivery retries cannot apply twice. */
export async function processWebhook<T>(provider: string, raw: string, eventId: string | undefined, action: (tx: Prisma.TransactionClient) => Promise<T>) {
  const id = `${provider}:${eventId || createHash("sha256").update(raw).digest("hex")}`;
  const db = getPrisma();
  return db.$transaction(async tx => {
    const receipt = await tx.webhookReceipt.createMany({ data: [{ id }], skipDuplicates: true });
    if (!receipt.count) return { duplicate: true };
    return { duplicate: false, result: await action(tx) };
  }, { timeout: 20000 });
}
