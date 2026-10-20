import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assertEntityAccess } from "@/lib/acl";
import { requireApiSession } from "@/lib/api-auth";
import { getPrisma, isNeonConfigured } from "@/lib/db";
/** Provider acceptance and confirmed delivery are deliberately distinct. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(); if (denied) return denied;
  if (!isNeonConfigured()) return NextResponse.json({ error: "Delivery queue requires PostgreSQL" }, { status: 503 });
  const db = getPrisma();
  const campaign = await db.campaign.findUnique({ where: { id: (await params).id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const scope = assertEntityAccess(await getSession(), campaign.brandId);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const counts = await db.sendJob.groupBy({ by: ["status"], where: { campaignId: campaign.id }, _count: true });
  const issues = await db.sendJob.findMany({ where: { campaignId: campaign.id, status: { in: ["failed", "uncertain", "bounced"] } }, take: 100, select: { id: true, leadId: true, status: true, providerId: true, error: true } });
  return NextResponse.json({ campaignId: campaign.id, counts: Object.fromEntries(counts.map(item => [item.status, item._count])), issues, note: "Accepted means the provider accepted the request; delivered requires a delivery receipt." });
}
