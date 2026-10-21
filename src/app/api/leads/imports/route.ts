import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { isAdminSession } from "@/lib/acl";
import { getPrisma, isNeonConfigured } from "@/lib/db";
import { uploadPrefix } from "@/lib/uploads";
import { createBulkImport, importEnvironment, wakeImport } from "@/lib/bulk-import";

const input = z.object({ requestId: z.uuid(), blobPath: z.string().min(1).max(1024), filename: z.string().min(1).max(255), fields: z.object({
  source: z.string().trim().min(1).max(100), groupName: z.string().trim().min(1).max(200),
  purchaseDate: z.iso.date(), costDollars: z.coerce.number().min(0).max(1_000_000),
}) });
function publicJob(job: { [key: string]: unknown }) {
  return Object.fromEntries(Object.entries(job).filter(([key]) => !["blobPath", "csvPath", "headers", "ownerId"].includes(key)));
}
export async function GET() {
  const denied = await requireApiSession(); if (denied) return denied;
  if (!isNeonConfigured()) return NextResponse.json({ jobs: [] });
  const session = await getSession();
  const jobs = await getPrisma().leadImportJob.findMany({ where: {
    environment: importEnvironment(), ...(isAdminSession(session) ? {} : { ownerId: session!.userId }),
  }, orderBy: { createdAt: "desc" }, take: 30 });
  return NextResponse.json({ jobs: jobs.map(publicJob) });
}
export async function POST(request: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!isNeonConfigured()) return NextResponse.json({ error: "Background imports require database storage" }, { status: 400 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a file, source, group, purchase date, and a valid nonnegative cost" }, { status: 400 });
  const value = parsed.data;
  if (!value.blobPath.startsWith(`${await uploadPrefix()}lead-imports/`) || value.blobPath.includes("..")) return NextResponse.json({ error: "Invalid upload reference" }, { status: 400 });
  if (!/\.(csv|xlsx|xls|xlsm)$/i.test(value.filename)) return NextResponse.json({ error: "Use CSV or Excel files" }, { status: 400 });
  try {
    const job = await createBulkImport({ requestId: value.requestId, ownerId: (await getSession())?.userId || "local", blobPath: value.blobPath,
      filename: value.filename, source: value.fields.source, groupName: value.fields.groupName,
      purchaseDate: value.fields.purchaseDate, costCents: Math.round(value.fields.costDollars * 100) });
    return NextResponse.json({ job: publicJob(job) }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error && /files must|request (belongs|already)/.test(error.message) ? error.message : "Unable to create import. Your file has not been sent to any recipients.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
export async function PATCH(request: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string" || !["resume", "cancel"].includes(body?.action)) return NextResponse.json({ error: "Invalid import action" }, { status: 400 });
  const db = getPrisma(), session = await getSession();
  const job = await db.leadImportJob.findUnique({ where: { id: body.id } });
  if (!job || job.environment !== importEnvironment() || (!isAdminSession(session) && job.ownerId !== session?.userId)) return NextResponse.json({ error: "Import not found" }, { status: 404 });
  if (job.status === "completed") return NextResponse.json({ job: publicJob(job) });
  // Serialize cancellation/resume with chunk commits. Already committed contacts stay saved.
  const updated = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(720261021::bigint)::text`;
    const current = await tx.leadImportJob.findUniqueOrThrow({ where: { id: job.id } });
    if (current.status === "completed") return current;
    return tx.leadImportJob.update({ where: { id: job.id }, data: { status: body.action === "resume" ? "queued" : "cancelled", error: null } });
  });
  if (body.action === "resume") await wakeImport(updated.id, updated.offset, true);
  return NextResponse.json({ job: publicJob(updated) });
}
