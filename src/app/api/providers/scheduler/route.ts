import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { isAdminSession } from "@/lib/acl";
import { wakeDispatcher } from "@/lib/dispatch-scheduler";
import { getPrisma } from "@/lib/db";
export async function GET() {
  const denied = await requireApiSession(); if (denied) return denied;
  if (!isAdminSession(await getSession())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const probe = await getPrisma().workerLease.findUnique({ where: { id: "queue-probe" } });
  return NextResponse.json({ queueProbeReceivedAt: probe?.expiresAt || null });
}
export async function POST(request: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  if (!isAdminSession(await getSession())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try { return NextResponse.json(await wakeDispatcher(0, body.action === "probe")); }
  catch { return NextResponse.json({ error: "Unable to schedule background worker" }, { status: 503 }); }
}
