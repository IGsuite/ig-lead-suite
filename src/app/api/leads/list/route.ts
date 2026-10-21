import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { isNeonConfigured } from "@/lib/db";
import { listLeads } from "@/lib/lead-list";
export async function GET(request: Request) {
  const denied = await requireApiSession(); if (denied) return denied;
  if (!isNeonConfigured()) return NextResponse.json({ error: "Database pagination is not available in local demo mode" }, { status: 400 });
  try {
    const q = new URL(request.url).searchParams;
    return NextResponse.json(await listLeads({ query:q.get("q")||"", group:q.get("group")||"all", source:q.get("source")||"all", folder:q.get("folder")||"all", cursor:q.get("cursor")||undefined }));
  } catch { return NextResponse.json({ error: "Unable to load lead page" }, { status: 400 }); }
}
