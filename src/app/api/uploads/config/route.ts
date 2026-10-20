import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { blobConfigured, uploadPrefix, requireProductionBlob } from "@/lib/uploads";
export async function GET() {
  const denied = await requireApiSession(); if (denied) return denied;
  requireProductionBlob();
  return NextResponse.json({ enabled: blobConfigured(), prefix: await uploadPrefix() });
}
