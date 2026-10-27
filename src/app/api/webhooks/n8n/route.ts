import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { decryptAccountPassword } from "@/lib/account-vault";
import { N8N_CREDENTIAL_KEY, n8nConfigSchema, n8nTokenCompany, validN8nAccess, n8nReportInput, n8nReportRecord } from "@/lib/n8n-connection";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization"), entityId = n8nTokenCompany(authorization);
  if (!entityId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const raw = await request.text(); if (Buffer.byteLength(raw) > 3000) return NextResponse.json({ error: "Report too large" }, { status: 413, headers });
  let report; try { report = n8nReportInput.parse(JSON.parse(raw)); } catch { return NextResponse.json({ error: "Use a workflow notice without contacts or credentials" }, { status: 400, headers }); }
  if (report.entityId !== entityId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const db = getPrisma();
  const accepted = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`n8n:${entityId}`}))::text`;
    const row = await tx.companyAccountCredential.findUnique({ where: { entityId_key: { entityId, key: N8N_CREDENTIAL_KEY } } });
    if (!row) return false;
    try {
      const config = n8nConfigSchema.parse(JSON.parse(decryptAccountPassword(row.encryptedValue, entityId, N8N_CREDENTIAL_KEY)));
      if (!validN8nAccess(authorization!.slice(7), entityId, config)) return false;
    } catch { return false; }
    const record = n8nReportRecord(report);
    if (await tx.companySetupEvent.findUnique({ where: { id: record.id }, select: { id: true } })) return true;
    const recent = await tx.companySetupEvent.count({ where: { entityId, itemKey: "n8n", id: { startsWith: `n8n:${entityId}:` }, createdAt: { gte: new Date(Date.now() - 60000) } } });
    if (recent >= 60) return "limited";
    await tx.companySetupEvent.create({ data: { ...record, acknowledgedAt: report.type === "workflow_failed" ? null : new Date() } });
    return true;
  });
  if (accepted === "limited") return NextResponse.json({ error: "Too many workflow notices" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  return accepted ? NextResponse.json({ received: true, scope: "workflow_reports_only", leadVerificationEnabled: false }, { headers }) : NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
}
