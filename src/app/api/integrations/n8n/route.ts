import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { canAccessEntity, isAdminSession } from "@/lib/acl";
import { getPrisma } from "@/lib/db";
import { accountVaultConfigured, encryptAccountPassword, decryptAccountPassword } from "@/lib/account-vault";
import { N8N_CREDENTIAL_KEY, newN8nAccess, n8nConfigSchema, n8nStarterWorkflow, type N8nConfig } from "@/lib/n8n-connection";

const headers = { "Cache-Control": "no-store, private", Pragma: "no-cache" };
export async function GET(request: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  const session = await getSession(), db = getPrisma(), url = new URL(request.url), entityId = url.searchParams.get("entityId");
  const companies = (await db.entity.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })).filter(c => canAccessEntity(session, c.id));
  if (!entityId || !companies.some(c => c.id === entityId)) return NextResponse.json({ error: "Choose an accessible company" }, { status: 403, headers });
  if (url.searchParams.has("download")) {
    const kind = url.searchParams.get("download");
    if (kind !== "test" && kind !== "errors") return NextResponse.json({ error: "Unknown workflow" }, { status: 400, headers });
    return NextResponse.json(n8nStarterWorkflow(entityId, url.origin, kind), { headers: { ...headers, "Content-Disposition": `attachment; filename="lead-suite-${entityId}-${kind}.json"` } });
  }
  const [row, setup, recent] = await Promise.all([
    db.companyAccountCredential.findUnique({ where: { entityId_key: { entityId, key: N8N_CREDENTIAL_KEY } } }),
    db.companySetupItem.findUnique({ where: { entityId_key: { entityId, key: "n8n" } }, select: { profileUrl: true, loginUrl: true } }),
    db.companySetupEvent.findMany({ where: { entityId, itemKey: "n8n", id: { startsWith: `n8n:${entityId}:` } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, message: true, createdAt: true } }),
  ]);
  let config: N8nConfig | undefined; try { if (row) config = n8nConfigSchema.parse(JSON.parse(decryptAccountPassword(row.encryptedValue, entityId, N8N_CREDENTIAL_KEY))); }
  catch { return NextResponse.json({ error: "The connection record cannot be opened. Ask the owner to check protected storage." }, { status: 503, headers }); }
  const tested = config ? await db.companySetupEvent.findFirst({ where: { entityId, itemKey: "n8n", id: { startsWith: `n8n:${entityId}:connection_test:` }, createdAt: { gte: new Date(config.issuedAt) } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }) : null;
  const state = !config ? "not_connected" : config.revoked ? "revoked" : Date.parse(config.expiresAt) <= Date.now() ? "expired" : tested ? "tested" : "awaiting_test";
  return NextResponse.json({ companies, entityId, setup, state, expiresAt: config?.expiresAt, revision: row?.revision || 0, isAdmin: isAdminSession(session), vaultConfigured: accountVaultConfigured(), recent, lastTestAt: tested?.createdAt, permissions: ["workflow_reports_only"], leadVerificationEnabled: false, commandCenterConnected: false }, { headers });
}

const input = z.object({ entityId: z.string().regex(/^[a-z0-9-]{1,100}$/), action: z.enum(["create", "revoke"]), revision: z.number().int().min(0), approvedScope: z.literal("workflow_reports_only") }).strict();
export async function POST(request: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  const session = await getSession();
  if (!isAdminSession(session) || request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Owner access required" }, { status: 403, headers });
  const raw = await request.text(); if (Buffer.byteLength(raw) > 2000) return NextResponse.json({ error: "Request too large" }, { status: 413, headers });
  let body; try { body = input.parse(JSON.parse(raw)); } catch { return NextResponse.json({ error: "Review the company and connection permission" }, { status: 400, headers }); }
  const db = getPrisma();
  if (!await db.entity.findUnique({ where: { id: body.entityId }, select: { id: true } })) return NextResponse.json({ error: "Company not found" }, { status: 404, headers });
  try {
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`n8n:${body.entityId}`}))::text`;
      const where = { entityId_key: { entityId: body.entityId, key: N8N_CREDENTIAL_KEY } };
      const old = await tx.companyAccountCredential.findUnique({ where });
      if ((old?.revision || 0) !== body.revision) throw Error("Refresh this page before changing the connection.");
      const access = newN8nAccess(body.entityId);
      if (body.action === "revoke") access.config.revoked = true;
      await tx.companyAccountCredential.upsert({ where, create: { id: randomUUID(), entityId: body.entityId, key: N8N_CREDENTIAL_KEY, encryptedValue: encryptAccountPassword(JSON.stringify(access.config), body.entityId, N8N_CREDENTIAL_KEY), updatedBy: session?.email || "Local admin" }, update: { encryptedValue: encryptAccountPassword(JSON.stringify(access.config), body.entityId, N8N_CREDENTIAL_KEY), revision: { increment: 1 }, updatedBy: session?.email || "Local admin" } });
      await tx.companySetupEvent.create({ data: { id: randomUUID(), entityId: body.entityId, itemKey: "n8n", message: `n8n marketing report access ${body.action === "revoke" ? "revoked" : "created or replaced"} by the owner. Lead access and campaign sending are not permitted.` } });
      return body.action === "create" ? { token: access.token, expiresAt: access.config.expiresAt } : { revoked: true };
    });
    return NextResponse.json(result, { headers });
  } catch { return NextResponse.json({ error: "Connection change could not save. Refresh and check protected storage before retrying." }, { status: 409, headers }); }
}
