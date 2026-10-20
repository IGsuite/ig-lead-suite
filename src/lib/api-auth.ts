import { NextResponse } from "next/server";
import { getSession, isAuthRequired } from "@/lib/auth";

export async function requireApiSession() {
  if (isAuthRequired() && !await getSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
