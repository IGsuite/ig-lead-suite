import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { canAccessEntity, isAdminSession } from "@/lib/acl";
import { getPrisma, isNeonConfigured } from "@/lib/db";
import { accountVaultConfigured, decryptAccountPassword, encryptAccountPassword } from "@/lib/account-vault";
import { META_BINDINGS, META_CREDENTIAL_KEY, MetaReportingError, metaConnectInput, metaStoredSchema, publicMetaState, verifyMetaReporting, type MetaStored } from "@/lib/meta-reporting";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store, private", Pragma: "no-cache" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }
async function record(entityId: string) {
  const row = await getPrisma().companyAccountCredential.findUnique({ where: { entityId_key: { entityId, key: META_CREDENTIAL_KEY } } });
  return { row, stored: row ? metaStoredSchema.parse(JSON.parse(decryptAccountPassword(row.encryptedValue, entityId, META_CREDENTIAL_KEY))) : null };
}
export async function GET(request: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  const entityId = new URL(request.url).searchParams.get("entityId");
  const session = await getSession();
  if (!entityId || !canAccessEntity(session, entityId)) return json({ error: "Choose a company you can access." }, 403);
  if (entityId !== "abstract") return json({ entityId, state: "needs_setup", supported: false, snapshot: null, publishingEnabled: false, inboxSyncEnabled: false });
  if (!isNeonConfigured()) return json({ error: "Connect the existing CRM database before setting up Meta reporting." }, 503);
  try {
    const { row, stored } = await record(entityId);
    return json({ entityId, supported: true, company: "Abstract Capital Group", binding: META_BINDINGS.abstract, isAdmin: isAdminSession(session), vaultConfigured: accountVaultConfigured(), ...publicMetaState(stored, row?.revision ?? 0) });
  } catch { return json({ error: "The protected Meta connection record could not be opened. Ask the owner to check account storage." }, 503); }
}

const actionInput = z.discriminatedUnion("action", [
  metaConnectInput.extend({ action: z.literal("connect"), approvedScope: z.literal("meta_reporting_only") }).strict(),
  z.object({ entityId: z.literal("abstract"), action: z.enum(["refresh", "disconnect"]), revision: z.number().int().min(0) }).strict(),
]);
class ChangedRecord extends Error {}
async function save(entityId: string, revision: number, stored: MetaStored, actor: string, message: string) {
  const db = getPrisma();
  const encryptedValue = encryptAccountPassword(JSON.stringify(stored), entityId, META_CREDENTIAL_KEY);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`meta-report:${entityId}`}))::text`;
    const where = { entityId_key: { entityId, key: META_CREDENTIAL_KEY } };
    const old = await tx.companyAccountCredential.findUnique({ where, select: { revision: true } });
    if ((old?.revision ?? 0) !== revision) throw new ChangedRecord();
    await tx.companyAccountCredential.upsert({ where, create: { id: randomUUID(), entityId, key: META_CREDENTIAL_KEY, encryptedValue, updatedBy: actor }, update: { encryptedValue, revision: { increment: 1 }, updatedBy: actor } });
    await tx.companySetupEvent.create({ data: { id: randomUUID(), entityId, itemKey: "facebook", message } });
  });
}

export async function POST(request: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  const session = await getSession();
  if (!isAdminSession(session) || request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Owner access on this website is required." }, 403);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 16000) return json({ error: "Connection request is too large." }, 413);
  let body; try { body = actionInput.parse(JSON.parse(raw)); } catch { return json({ error: "Check the connection fields and reporting permission." }, 400); }
  const actor = session?.email || "Local owner";
  if (!isNeonConfigured() || !accountVaultConfigured()) return json({ error: "Protected account storage must be configured before connecting Meta." }, 503);
  try {
    const db = getPrisma();
    if (!await db.entity.findUnique({ where: { id: body.entityId }, select: { id: true } })) return json({ error: "Company not found." }, 404);
    const { row, stored } = await record(body.entityId);
    if ((row?.revision ?? 0) !== body.revision) return json({ error: "The connection changed. Refresh before saving." }, 409);
    if (body.action === "disconnect") {
      if (!stored) return json({ error: "No Meta credential is stored." }, 404);
      await save(body.entityId, body.revision, { ...stored, accessToken: "", appSecret: "", revoked: true }, actor, "Meta reporting disconnected locally; stored token and app secret cleared. Meta-side access must be revoked in Meta separately.");
    } else {
      if (body.action === "refresh" && (!stored || stored.revoked)) return json({ error: "Connect Meta reporting first." }, 400);
      const input = body.action === "connect" ? body : stored!;
      let snapshot;
      try { snapshot = await verifyMetaReporting(input); }
      catch (error) {
        if (body.action === "refresh" && stored) await save(body.entityId, body.revision, { ...stored, lastFailureAt: new Date().toISOString() }, actor, "Meta report refresh failed; the previous report is retained as a dated snapshot.");
        if (error instanceof MetaReportingError) return json({ error: error.message }, 422);
        throw error;
      }
      await save(body.entityId, body.revision, { entityId: body.entityId, accessToken: input.accessToken, appSecret: input.appSecret, adAccountId: input.adAccountId, snapshot, revoked: false }, actor, `Meta reporting ${body.action === "connect" ? "connected" : "refreshed"}: expected company Page confirmed${snapshot.adAccount ? "; expected company ad account and report read confirmed" : "; no ad account connected"}. Publishing and message sending remain disabled.`);
    }
    const current = await record(body.entityId);
    return json(publicMetaState(current.stored, current.row?.revision ?? 0));
  } catch (error) {
    if (error instanceof ChangedRecord) return json({ error: "The connection changed. Refresh before saving." }, 409);
    return json({ error: "Meta reporting could not save. Check protected storage and try again." }, 503);
  }
}
