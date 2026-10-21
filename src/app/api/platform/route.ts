import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { scopePlatformData } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import { getData, getStorageMode, resetData } from "@/lib/store";
import { ensureDefaultAdmin } from "@/lib/users-store";
import { isAdminSession } from "@/lib/acl";
import { attachLeadSummary } from "@/lib/lead-summary";

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    await ensureDefaultAdmin();
    const session = await getSession();
    let data = await getData(getStorageMode() === "neon" ? { leadLimit: 0 } : undefined);
    if (getStorageMode() === "neon") data = await attachLeadSummary(data);
    if (getStorageMode() === "neon" && new URL(request.url).searchParams.get("leads") === "none") data.leads = [];
    const scoped = scopePlatformData(data, session);
    return NextResponse.json({
      ...scoped,
      storageMode: getStorageMode(),
    });
  } catch (err) {
    console.error("[api/platform] GET failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load platform data",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
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
