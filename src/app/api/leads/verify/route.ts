import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { verifyLeads } from "@/lib/store";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const body = (await request.json().catch(() => ({}))) as {
    leadIds?: string[];
    onlyUnverified?: boolean;
  };
  const result = await verifyLeads({
    leadIds: body.leadIds,
    onlyUnverified: body.onlyUnverified,
  });
  return NextResponse.json(result);
}
