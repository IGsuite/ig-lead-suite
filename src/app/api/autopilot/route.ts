import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import { getData, runAutopilotDay, updateRotation } from "@/lib/store";
import type { RotationConfig } from "@/lib/types";

export async function GET() {
  const session = await getSession();
  const data = await getData();
  if (!isAdminSession(session) && session) {
    const allowed = new Set(session.allowedEntityIds);
    return NextResponse.json({
      ...data.rotation,
      entityOrder: data.rotation.entityOrder.filter((id) => allowed.has(id)),
      quotas: data.rotation.quotas.filter((q) => allowed.has(q.entityId)),
    });
  }
  return NextResponse.json(data.rotation);
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const patch = (await request.json()) as Partial<RotationConfig>;
  const rotation = await updateRotation(patch);
  return NextResponse.json(rotation);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
  };
  if (body.action === "run") {
    const result = await runAutopilotDay();
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
