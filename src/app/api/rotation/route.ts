import { NextResponse } from "next/server";
import { getData, updateRotation } from "@/lib/store";
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
