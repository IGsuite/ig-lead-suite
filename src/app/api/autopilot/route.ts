import { NextResponse } from "next/server";
import { getData, runAutopilotDay, updateRotation } from "@/lib/store";
import type { RotationConfig } from "@/lib/types";

export async function GET() {
  const data = await getData();
  return NextResponse.json(data.rotation);
}

export async function PATCH(request: Request) {
  const patch = (await request.json()) as Partial<RotationConfig>;
  const rotation = await updateRotation(patch);
  return NextResponse.json(rotation);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
  };
  if (body.action === "run") {
    const result = await runAutopilotDay();
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
