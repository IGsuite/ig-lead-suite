import { NextResponse } from "next/server";
import { getSession, isAuthRequired } from "@/lib/auth";

export function setupRoleAllowed(role: string | undefined, allowSetup=false) {
  return role!=="setup"||allowSetup;
}

export async function requireApiSession(options: { allowSetup?: boolean } = {}) {
  if (!isAuthRequired()) return null;
  const session = await getSession();
  if (isAuthRequired() && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // New setup users are denied by default across all existing operational APIs.
  if (!setupRoleAllowed(session?.role, options.allowSetup)) {
    return NextResponse.json({ error: "This account has company setup access only." }, { status: 403 });
  }
  return null;
}
