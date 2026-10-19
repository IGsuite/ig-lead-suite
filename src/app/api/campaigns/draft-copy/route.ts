import { NextResponse } from "next/server";
import { assertEntityAccess } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import {
  generateDraftCopy,
  resolveDraftCopyAiMode,
  type DraftTone,
} from "@/lib/draft-copy-ai";
import { getData } from "@/lib/store";
import type { CampaignChannel } from "@/lib/types";

export async function GET() {
  const resolved = resolveDraftCopyAiMode();
  return NextResponse.json({
    mode: resolved.mode,
    modelId: resolved.modelId,
    configured: resolved.mode === "live",
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  const body = (await request.json()) as {
    channel?: CampaignChannel;
    brandId?: string | null;
    tone?: DraftTone | string;
    brief?: string;
  };

  if (!body.channel || (body.channel !== "sms" && body.channel !== "email")) {
    return NextResponse.json(
      { error: "channel must be sms or email" },
      { status: 400 },
    );
  }

  const tone: DraftTone = body.tone === "growth" ? "growth" : "soft";
  const brandId = body.brandId ?? null;

  if (brandId) {
    const gate = assertEntityAccess(session, brandId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
  }

  const data = await getData();
  const brand = brandId
    ? data.brands.find((b) => b.id === brandId) || null
    : null;

  if (brandId && !brand) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  const result = await generateDraftCopy({
    channel: body.channel,
    brand,
    tone,
    brief: body.brief?.trim(),
  });

  return NextResponse.json(result);
}
