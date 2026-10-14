import { NextResponse } from "next/server";
import { scopePlatformData } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import { getData, getStorageMode, resetData } from "@/lib/store";
import { ensureDefaultAdmin } from "@/lib/users-store";
import { isAdminSession } from "@/lib/acl";

export async function GET() {
  await ensureDefaultAdmin();
  const session = await getSession();
  const data = await getData();
  const scoped = scopePlatformData(data, session);
  return NextResponse.json({
    ...scoped,
    storageMode: getStorageMode(),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action === "reset") {
    const data = await resetData();
    return NextResponse.json({
      ...scopePlatformData(data, session),
      storageMode: getStorageMode(),
    });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
