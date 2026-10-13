import { NextResponse } from "next/server";
import { getData, resetData } from "@/lib/store";

export async function GET() {
  const data = await getData();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action === "reset") {
    const data = await resetData();
    return NextResponse.json(data);
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
