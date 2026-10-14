import { NextResponse } from "next/server";
import { assertEntityAccess } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import { getData, markReply } from "@/lib/store";
import type { Reply } from "@/lib/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await getSession();
  const data = await getData();
  const existing = data.replies.find((r) => r.id === id);
  if (!existing) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }
  const gate = assertEntityAccess(session, existing.brandId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const patch = (await request.json()) as Partial<
    Pick<Reply, "read" | "crmSynced" | "sentiment" | "manualForwarded">
  >;
  const reply = await markReply(id, patch);
  if (!reply) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }
  return NextResponse.json(reply);
}
