import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/db";
import { decryptAccountPassword, encryptAccountPassword } from "@/lib/account-vault";
import { TIKTOK_REPORT_KEY, tiktokStoredSchema, type TiktokStored } from "@/lib/tiktok-reporting";
export class TiktokRecordChanged extends Error {}
export async function readTiktokReport() {
  const row = await getPrisma().companyAccountCredential.findUnique({ where: { entityId_key: { entityId: "abstract", key: TIKTOK_REPORT_KEY } } });
  return { row, stored: row ? tiktokStoredSchema.parse(JSON.parse(decryptAccountPassword(row.encryptedValue, "abstract", TIKTOK_REPORT_KEY))) : null };
}
export async function saveTiktokReport(stored: TiktokStored, revision: number, actor: string, message: string) {
  const next = tiktokStoredSchema.parse(stored);
  return getPrisma().$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"tiktok-report:abstract"}))::text`;
    const where = { entityId_key: { entityId: "abstract", key: TIKTOK_REPORT_KEY } };
    const old = await tx.companyAccountCredential.findUnique({ where, select: { revision: true } });
    if ((old?.revision ?? 0) !== revision) throw new TiktokRecordChanged();
    const encryptedValue = encryptAccountPassword(JSON.stringify(next), "abstract", TIKTOK_REPORT_KEY);
    await tx.companyAccountCredential.upsert({ where, create: { id: randomUUID(), entityId: "abstract", key: TIKTOK_REPORT_KEY, encryptedValue, updatedBy: actor }, update: { encryptedValue, revision: { increment: 1 }, updatedBy: actor } });
    await tx.companySetupEvent.create({ data: { id: randomUUID(), entityId: "abstract", itemKey: "tiktok", message } });
  });
}
