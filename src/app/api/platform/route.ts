import { NextResponse } from "next/server";
import { getData, getStorageMode, resetData } from "@/lib/store";

export async function GET() {
  const data = await getData();
  return NextResponse.json({
    ...data,
    storageMode: getStorageMode(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action === "reset") {
    const data = await resetData();
    return NextResponse.json({
      ...data,
      storageMode: getStorageMode(),
    });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
