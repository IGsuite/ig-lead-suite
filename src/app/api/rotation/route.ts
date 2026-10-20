import { requireApiSession } from "@/lib/api-auth";
import { isAdminSession } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getData, updateRotation } from "@/lib/store";
import type { RotationConfig } from "@/lib/types";

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const data = await getData();
  return NextResponse.json(data.rotation);
}

export async function PATCH(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  if (!isAdminSession(await getSession())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const patch = (await request.json()) as Partial<RotationConfig>;
  const rotation = await updateRotation(patch);
  return NextResponse.json(rotation);
}
