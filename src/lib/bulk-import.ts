import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { get, head, put, del } from "@vercel/blob";
import { send } from "@vercel/queue";
import * as XLSX from "xlsx";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import { mapCsvRow, isExcelUpload } from "@/lib/lead-csv";
import { verifyContact } from "@/lib/verify";
import { BULK_MAX_BYTES, BULK_MAX_ROWS, BULK_READ_BYTES, BULK_EXCEL_MAX_BYTES, csvRecords, csvHeaders, emailKey, phoneKey } from "@/lib/bulk-csv";

export const IMPORT_TOPIC = "lead-imports";
export function importEnvironment() { return process.env.VERCEL_ENV || "local"; }

export async function wakeImport(id: string, offset: number, retry = false) {
  if (process.env.VERCEL !== "1") return;
  await send(IMPORT_TOPIC, { id }, { retentionSeconds: 604800,
    idempotencyKey: `import:${id}:${offset}${retry ? `:${randomUUID()}` : ""}` });
}

/** Only opaque IDs enter the queue; all contact data stays in private storage/Postgres. */
export async function createBulkImport(input: {
  requestId: string; ownerId: string; blobPath: string; filename: string;
  source: string; groupName: string; purchaseDate: string; costCents: number;
}) {
  const db = getPrisma();
  const old = await db.leadImportJob.findUnique({ where: { requestId: input.requestId } });
  if (old) {
    if (old.ownerId !== input.ownerId || old.environment !== importEnvironment()) throw new Error("Import request belongs to another session");
    if (old.blobPath !== input.blobPath) throw new Error("Import request already belongs to another file");
    return old;
  }
  const metadata = await head(input.blobPath);
  const excel = isExcelUpload({ name: input.filename });
  if (!metadata.size || metadata.size > (excel ? BULK_EXCEL_MAX_BYTES : BULK_MAX_BYTES)) throw new Error(excel ? "Excel files must be at most 20 MB; export larger workbooks as CSV." : "CSV files must be at most 200 MB.");
  const job = await db.leadImportJob.create({ data: { ...input, purchaseDate:new Date(`${input.purchaseDate}T00:00:00.000Z`), id: `import-${randomUUID()}`, sizeBytes: metadata.size, environment: importEnvironment() } });
  await wakeImport(job.id, 0).catch(async () => {
    await db.leadImportJob.update({ where: { id: job.id }, data: { error: "Background worker could not be reached. Use Resume to retry." } });
  });
  return job;
}

async function prepareCsv(job: Awaited<ReturnType<typeof createBulkImport>>) {
  if (job.csvPath) return job;
  const db = getPrisma();
  let pathname = job.blobPath, size = job.sizeBytes;
  if (isExcelUpload({ name: job.filename })) {
    const blob = await get(job.blobPath, { access: "private" });
    if (!blob || blob.statusCode !== 200) throw new Error("Import file was not found");
    const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());
    if (bytes.length > BULK_EXCEL_MAX_BYTES) throw new Error("Workbook is too large. Export it as CSV.");
    // Dense cells avoid an additional matrix/object copy. Only the first sheet is imported.
    const book = XLSX.read(bytes, { type: "array", dense: true, cellDates: true });
    const sheet = book.Sheets[book.SheetNames[0]];
    if (!sheet || !sheet["!ref"]) throw new Error("Workbook has no data on the first sheet");
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    if (range.e.r > BULK_MAX_ROWS || (range.e.r + 1) * (range.e.c + 1) > 5_000_000) throw new Error("Workbook is too large to convert safely. Export the needed contact columns as CSV.");
    XLSX.stream.set_readable(Readable);
    const csv = await put(`${job.blobPath}.normalized.csv`, XLSX.stream.to_csv(sheet), {
      access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "text/csv; charset=utf-8",
    });
    pathname = csv.pathname;
    size = (await head(pathname)).size;
    if (size > BULK_MAX_BYTES) throw new Error("Converted workbook exceeds the 200 MB CSV limit");
  }
  return db.leadImportJob.update({ where: { id: job.id }, data: { csvPath: pathname, csvBytes: size } });
}

export async function processBulkImport(id: string) {
  const db = getPrisma();
  let job = await db.leadImportJob.findUniqueOrThrow({ where: { id } });
  // A deployment must never consume a different environment's import.
  if (job.environment !== importEnvironment() || job.status === "completed" || job.status === "cancelled" || job.status === "failed") return;
  try {
    job = await prepareCsv(job);
    const end = Math.min(job.offset + BULK_READ_BYTES, job.csvBytes!);
    const blob = await get(job.csvPath!, { access: "private", headers: { Range: `bytes=${job.offset}-${end - 1}` } });
    if (!blob || blob.statusCode !== 200) throw new Error("Import file was not found");
    // The SDK maps successful 206 to statusCode=200. Require the actual Content-Range
    // before buffering, so a server ignoring Range cannot load a 200 MB file here.
    const expected = `bytes ${job.offset}-${end - 1}/${job.csvBytes}`;
    if (blob.headers.get("content-range") !== expected) {
      await blob.stream.cancel();
      throw new Error("Private storage did not return the requested file range");
    }
    const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());
    if (bytes.length !== end - job.offset) throw new Error("Incomplete file range; resume the import");
    const records = csvRecords(bytes, end === job.csvBytes);
    const nextOffset = records.length ? job.offset + records.at(-1)!.end : end;
    let headers = job.headers as string[];
    if (job.offset === 0) headers = csvHeaders(records.shift()?.values || []);
    const rows = records.filter(r => r.values.some(v => v.trim())).map(r => {
      if (r.values.length !== headers.length) throw new Error("A CSV row has a different number of columns than the header. Correct the file and retry.");
      return mapCsvRow(Object.fromEntries(headers.map((h, i) => [h, r.values[i]])));
    });
    if (job.rowCount + rows.length > BULK_MAX_ROWS) throw new Error("Import reached the 1,000,000-row limit. Earlier batches remain saved; split the remaining rows into another file.");
    await commitImportChunk(job, rows, headers, nextOffset);
  } catch (error) {
    // Never expose contact rows, blob tokens, or database messages in the UI.
    const message = error instanceof Error && /CSV|Workbook|workbook|Import file|Private storage|Incomplete file|Converted/.test(error.message)
      ? error.message : "Import stopped. Saved batches are safe; use Resume to continue from the last checkpoint.";
    await db.leadImportJob.updateMany({ where: { id, status: { notIn: ["completed", "cancelled"] } }, data: { status: "failed", error: message } });
    throw new Error("Lead import worker stopped");
  }
  // Always read the committed offset, including duplicate queue deliveries.
  const current = await db.leadImportJob.findUniqueOrThrow({ where: { id } });
  if (current.status === "completed") {
    await del([...new Set([current.blobPath, current.csvPath!])]).catch(() => undefined);
  } else if (current.status === "processing" || current.status === "queued") {
    await wakeImport(current.id, current.offset);
  }
}

type ImportJob = Awaited<ReturnType<typeof createBulkImport>>;
type ImportRow = ReturnType<typeof mapCsvRow>;

/** Exported for isolated Postgres integration tests. Atomic checkpoint = safe redelivery. */
export async function commitImportChunk(job: ImportJob, rows: ImportRow[], headers: string[], nextOffset: number) {
  const db = getPrisma();
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(720261021::bigint)::text`;
    const current = await tx.leadImportJob.findUniqueOrThrow({ where: { id: job.id } });
    if (current.offset !== job.offset || ["completed", "cancelled", "failed"].includes(current.status)) return false;
    const checked = rows.map(row => ({row,checks:verifyContact(row)}));
    const emails = [...new Set(checked.filter(r=>r.checks.emailStatus!=="invalid").map(r => emailKey(r.row.email)).filter(Boolean))];
    const phones = [...new Set(checked.filter(r=>r.checks.phoneStatus!=="invalid").map(r => phoneKey(r.row.phone)).filter(Boolean))];
    const existing = await tx.$queryRaw<{ id: string; email: string | null; phone: string | null }[]>(Prisma.sql`
      SELECT "id","email","phone" FROM "Lead" WHERE
      lead_email_key("email") IN (${Prisma.join(emails.length ? emails : [""])}) OR
      lead_phone_key("phone") IN (${Prisma.join(phones.length ? phones : [""])})`);
    const suppressions = await tx.$queryRaw<{ contact: string }[]>(Prisma.sql`
      SELECT "contact" FROM "OptOut" WHERE
      lead_email_key("contact") IN (${Prisma.join(emails.length ? emails : [""])}) OR
      lead_phone_key("contact") IN (${Prisma.join(phones.length ? phones : [""])})`);
    const byEmail = new Map(existing.filter(l => l.email).map(l => [emailKey(l.email), l]));
    const byPhone = new Map(existing.filter(l => l.phone).map(l => [phoneKey(l.phone), l]));
    const optedEmails = new Set(suppressions.map(o => emailKey(o.contact)));
    const optedPhones = new Set(suppressions.map(o => phoneKey(o.contact)));
    let duplicates = 0, skipped = 0, suppressed = 0;
    const inserts: Prisma.LeadCreateManyInput[] = [];
    const members = new Set<string>();
    for (let index = 0; index < rows.length; index++) {
      const {row,checks} = checked[index];
      const e = checks.emailStatus==="invalid"?"":emailKey(row.email), p = checks.phoneStatus==="invalid"?"":phoneKey(row.phone);
      if (!row.email && !row.phone) { skipped++; continue; }
      const oldEmail = e ? byEmail.get(e) : undefined, oldPhone = p ? byPhone.get(p) : undefined;
      const old = oldEmail || oldPhone;
      if (old) {
        duplicates++;
        members.add(old.id);
        // Never merge two established identities or overwrite a contact/suppression.
        // Complementary contact enrichment is handled separately after review.
        continue;
      }
      const leadId = `${job.id}-${job.rowCount + index}`;
      const optedOut = Boolean((e && optedEmails.has(e)) || (p && optedPhones.has(p)));
      if (optedOut) suppressed++;
      inserts.push({ id: leadId, email: row.email || null, phone: row.phone || null,
        firstName: row.firstName?.slice(0,100), lastName: row.lastName?.slice(0,100), businessName: row.businessName?.slice(0,200),
        source: job.source, groupName: job.groupName, purchaseDate: job.purchaseDate, costCents: 0,
        status: "available", optedOut, offeredEntityIds: [], ...checks, verifiedAt: new Date(), uploadBatchId: job.id });
      const identity = { id: leadId, email: row.email || null, phone: row.phone || null };
      if (e) byEmail.set(e, identity);
      if (p) byPhone.set(p, identity);
      members.add(leadId);
    }
    await tx.uploadBatch.upsert({ where: { id: job.id }, create: {
      id: job.id, filename: job.filename, source: job.source, groupName: job.groupName, purchaseDate: job.purchaseDate,
      costCents: job.costCents, rowCount: 0, importedCount: 0, duplicateCount: 0,
    }, update: {} });
    if (inserts.length) await tx.lead.createMany({ data: inserts });
    if (members.size) await tx.leadImportMembership.createMany({ data: [...members].map(leadId => ({ jobId: job.id, leadId })), skipDuplicates: true });
    const completed = nextOffset === job.csvBytes;
    if(completed && job.costCents)await tx.lead.updateMany({where:{uploadBatchId:job.id},data:{costCents:Math.round(job.costCents/Math.max(1,current.rowCount+rows.length))}});
    await tx.uploadBatch.update({ where: { id: job.id }, data: {
      rowCount: { increment: rows.length }, importedCount: { increment: inserts.length }, duplicateCount: { increment: duplicates },
    } });
    await tx.leadImportJob.update({ where: { id: job.id }, data: {
      offset: nextOffset, headers, status: completed ? "completed" : "processing", error: null,
      rowCount: { increment: rows.length }, importedCount: { increment: inserts.length }, duplicateCount: { increment: duplicates },
      skippedCount: { increment: skipped }, suppressedCount: { increment: suppressed },
    } });
    if (completed) await tx.providerSpend.upsert({ where: { source: job.source }, create: {
      source: job.source, leadsPurchased: current.importedCount + inserts.length, costCents: job.costCents,
    }, update: { leadsPurchased: { increment: current.importedCount + inserts.length }, costCents: { increment: job.costCents } } });
    return true;
  }, { timeout: 60_000 });
}
