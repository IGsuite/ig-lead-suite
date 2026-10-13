import { NextResponse } from "next/server";
import { markReply } from "@/lib/store";
import type { Reply } from "@/lib/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const patch = (await request.json()) as Partial<
    Pick<Reply, "read" | "crmSynced" | "sentiment">
  >;
  const reply = await markReply(id, patch);
  if (!reply) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }
  return NextResponse.json(reply);
}
