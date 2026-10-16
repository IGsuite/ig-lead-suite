import { NextResponse } from "next/server";
import { getSession, isAuthRequired } from "@/lib/auth";
import { createLead } from "@/lib/store";

/**
 * Create a single lead in the shared pool.
 * Leads are entity-agnostic (shared pool) — any authenticated user may add,
 * matching how the pool is visible on the Leads page.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (isAuthRequired() && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    businessName?: string;
    source?: string;
    groupName?: string;
  };

  const result = await createLead({
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone,
    businessName: body.businessName,
    source: body.source,
    groupName: body.groupName,
  });

  if (!result.ok) {
    const status = result.code === "validation" ? 400 : 409;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status },
    );
  }

  return NextResponse.json({ lead: result.lead }, { status: 201 });
}
