import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { assertEntityAccess, canAccessEntity, isAdminSession } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import {
  createMessageTemplate,
  deleteMessageTemplate,
  getData,
  updateMessageTemplate,
} from "@/lib/store";
import { validatePrograms } from "@/lib/programs";
import type { CampaignChannel } from "@/lib/types";

type CreativeBody = {
  action?: string;
  id?: string;
  name?: string;
  channel?: CampaignChannel;
  subject?: string;
  body?: string;
  brandId?: string | null;
  folderId?: string | null;
  programs?: string[];
};

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const session = await getSession();
  const data = await getData({ leadLimit: 0 });
  const templates = (data.messageTemplates || []).filter(
    (t) => !t.brandId || canAccessEntity(session, t.brandId),
  );
  return NextResponse.json(templates);
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const session = await getSession();
  const payload = (await request.json()) as CreativeBody;

  if (payload.action === "delete" && payload.id) {
    const data = await getData({ leadLimit: 0 });
    const existing = (data.messageTemplates || []).find(
      (t) => t.id === payload.id,
    );
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    if (existing.brandId) {
      const gate = assertEntityAccess(session, existing.brandId);
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: gate.status });
      }
    } else if (!isAdminSession(session)) {
      return NextResponse.json(
        { error: "Only admins can delete shared templates" },
        { status: 403 },
      );
    }
    const ok = await deleteMessageTemplate(payload.id);
    if (!ok) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  if (payload.action === "update" && payload.id) {
    const data = await getData({ leadLimit: 0 });
    const existing = (data.messageTemplates || []).find(
      (t) => t.id === payload.id,
    );
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    if (existing.brandId) {
      const gate = assertEntityAccess(session, existing.brandId);
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: gate.status });
      }
    } else if (!isAdminSession(session)) {
      return NextResponse.json(
        { error: "Only admins can edit shared templates" },
        { status: 403 },
      );
    }
    if (payload.brandId) {
      const gate = assertEntityAccess(session, payload.brandId);
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: gate.status });
      }
    }
    const nextBrandId = payload.brandId === undefined ? existing.brandId : payload.brandId;
    let programs: string[];
    try { programs=validatePrograms(data.brands.find(b=>b.id===nextBrandId),payload.programs ?? existing.programs ?? []); }
    catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Invalid programs"},{status:400}); }
    const updated = await updateMessageTemplate(payload.id, {
      name: payload.name,
      programs,
      channel: payload.channel,
      subject: payload.subject,
      body: payload.body,
      brandId: payload.brandId === undefined ? undefined : payload.brandId,
      folderId: payload.folderId === undefined ? undefined : payload.folderId,
    });
    if (!updated) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  }

  if (!payload.name?.trim() || !payload.channel || !payload.body?.trim()) {
    return NextResponse.json(
      { error: "Name, channel, and message body are required" },
      { status: 400 },
    );
  }

  const brandId = payload.brandId ?? null;
  if (brandId) {
    const gate = assertEntityAccess(session, brandId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
  } else if (!isAdminSession(session)) {
    return NextResponse.json(
      { error: "Only admins can create shared templates" },
      { status: 403 },
    );
  }

  let programs: string[];
  try { const data=await getData({ leadLimit: 0 }); programs=validatePrograms(data.brands.find(b=>b.id===brandId),payload.programs); }
  catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Invalid programs"},{status:400}); }
  const template = await createMessageTemplate({
    programs,
    name: payload.name.trim(),
    channel: payload.channel,
    subject:
      payload.channel === "email"
        ? payload.subject?.trim() || undefined
        : undefined,
    body: payload.body.trim(),
    brandId,
    folderId: payload.folderId ?? null,
  });

  return NextResponse.json(template);
}
