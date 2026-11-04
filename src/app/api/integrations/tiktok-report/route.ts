import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { canAccessEntity, isAdminSession } from "@/lib/acl";
import { isNeonConfigured } from "@/lib/db";
import { accountVaultConfigured } from "@/lib/account-vault";
import { fetchTiktokReport, publicTiktokState, TiktokReportError } from "@/lib/tiktok-reporting";
import { readTiktokReport, saveTiktokReport, TiktokRecordChanged } from "@/lib/tiktok-report-store";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store, private", Pragma: "no-cache" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }
export async function GET(request: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  const session = await getSession(), entityId = new URL(request.url).searchParams.get("entityId");
  if (!entityId || !canAccessEntity(session, entityId)) return json({ error: "Choose a company you can access." }, 403);
  if (entityId !== "abstract") return json({ supported: false, state: "needs_setup", snapshot: null });
  if (!isNeonConfigured()) return json({ error: "The CRM database is required." }, 503);
  try {
    const { row, stored } = await readTiktokReport();
    return json({ supported: true, isAdmin: isAdminSession(session), vaultConfigured: accountVaultConfigured(), ...publicTiktokState(stored, row?.revision ?? 0) });
  } catch { return json({ error: "Protected TikTok reporting storage could not be opened." }, 503); }
}
const input = z.discriminatedUnion("action", [
  z.object({ entityId: z.literal("abstract"), action: z.literal("connect"), revision: z.number().int().min(0), apiKey: z.string().trim().min(8).max(512), approvedScope: z.literal("abstract_tiktok_reporting_daily") }).strict(),
  z.object({ entityId: z.literal("abstract"), action: z.enum(["refresh", "disconnect"]), revision: z.number().int().min(0) }).strict(),
]);
export async function POST(request: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  const session = await getSession();
  if (!isAdminSession(session) || !canAccessEntity(session, "abstract") || request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Owner access on this website is required." }, 403);
  const raw = await request.text(); if (Buffer.byteLength(raw) > 3000) return json({ error: "Connection request is too large." }, 413);
  let body; try { body = input.parse(JSON.parse(raw)); } catch { return json({ error: "Check the connection fields and reporting approval." }, 400); }
  if (!isNeonConfigured() || !accountVaultConfigured()) return json({ error: "Protected account storage is required." }, 503);
  try {
    const { row, stored } = await readTiktokReport(), actor = session?.email || "Local owner";
    if ((row?.revision ?? 0) !== body.revision) throw new TiktokRecordChanged();
    if (body.action !== "connect" && (!stored || stored.revoked)) return json({ error: "Connect TikTok reporting first." }, 400);
    if (body.action === "disconnect") {
      await saveTiktokReport({ ...stored!, apiKey: "", revoked: true }, body.revision, actor, "TikTok reporting disconnected locally. Stored Windsor key cleared; revoke access in Windsor separately.");
    } else {
      const apiKey = body.action === "connect" ? body.apiKey : stored!.apiKey;
      let snapshot;
      try { snapshot = await fetchTiktokReport(apiKey); }
      catch (error) {
        if (body.action === "refresh") await saveTiktokReport({ ...stored!, lastFailureAt: new Date().toISOString() }, body.revision, actor, "TikTok report refresh failed. The previous dated report is retained.");
        throw error;
      }
      await saveTiktokReport({ entityId: "abstract", apiKey, revoked: false, snapshot }, body.revision, actor, "Abstract TikTok report verified and saved. Daily reporting checks enabled; posting, advertising and message sending remain disabled.");
    }
    const current = await readTiktokReport();
    return json(publicTiktokState(current.stored, current.row?.revision ?? 0));
  } catch (error) {
    if (error instanceof TiktokRecordChanged) return json({ error: "The connection changed. Reload before saving." }, 409);
    if (error instanceof TiktokReportError) return json({ error: error.message }, 422);
    return json({ error: "TikTok reporting could not save. Check protected storage." }, 503);
  }
}
