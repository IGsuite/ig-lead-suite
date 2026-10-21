import { NextResponse } from "next/server";
import { assertEntityAccess } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import { getData } from "@/lib/store";
import { listInboxSends } from "@/lib/inbox-store";
import { assertReplyAllowed, sendConversationReply } from "@/lib/inbox-service";
import { conversationKey } from "@/lib/conversation-key";
import { requireApiSession } from "@/lib/api-auth";
import { inboxSendingDisabledReason } from "@/lib/inbox-service";
import { getPrisma, isNeonConfigured } from "@/lib/db";
import { mapLead } from "@/lib/mappers";

type Context = { params: Promise<{ id: string }> };
async function load(context: Context) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return { response: unauthorized };
  const session = await getSession();
  const { id } = await context.params;
  const data = await getData({leadLimit:0});
  const reply = data.replies.find((r) => r.id === id);
  if (!reply) return { response: NextResponse.json({ error: "Conversation not found" }, { status: 404 }) };
  const gate = assertEntityAccess(session, reply.brandId);
  if (!gate.ok) return { response: NextResponse.json({ error: gate.error }, { status: gate.status }) };
  if(isNeonConfigured()){
    const lead=await getPrisma().lead.findUnique({where:{id:reply.leadId}});
    data.leads=lead?[mapLead(lead)]:[];
  }
  return { data, reply };
}

export async function GET(_request: Request, context: Context) {
  const loaded = await load(context);
  if (loaded.response) return loaded.response;
  const { data, reply } = loaded;
  let disabledReason: string | undefined;
  disabledReason = inboxSendingDisabledReason(reply);
  try { assertReplyAllowed(data, reply); }
  catch (error) { disabledReason = (error as Error).message; }
  if (!reply.providerContext?.mailbox) disabledReason ||= "This older reply has no receiving identity. A new inbound message is needed before replying.";
  const inbound = data.replies.filter((r) => conversationKey(r) === conversationKey(reply))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return NextResponse.json({ inbound, outbound: await listInboxSends(reply, data.replies), disabledReason,
    from: reply.providerContext?.mailbox, to: reply.from }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  const loaded = await load(context);
  if (loaded.response) return loaded.response;
  try {
    const body = await request.json();
    if (typeof body.body !== "string" || typeof body.requestId !== "string") throw new Error("Reply text and send request ID are required");
    const send = await sendConversationReply(loaded.data, loaded.reply, body.body, body.requestId);
    return NextResponse.json({ send }, { status: send.status === "accepted" ? 202 : send.status === "failed" ? 422 : 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send reply" }, { status: 422 });
  }
}
