import { NextResponse } from "next/server";
import { verifyLeads } from "@/lib/store";

export async function POST(request: Request) {
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
