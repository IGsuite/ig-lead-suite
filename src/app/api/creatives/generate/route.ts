import { NextResponse } from "next/server";
import { assertEntityAccess } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import {
  generateCreativeDrafts,
  resolveCreativeAiMode,
} from "@/lib/creative-ai";
import { getData } from "@/lib/store";
import type { CampaignChannel } from "@/lib/types";

export async function GET() {
  const resolved = resolveCreativeAiMode();
  return NextResponse.json({
    mode: resolved.mode,
    provider: resolved.provider,
    modelId: resolved.modelId,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  const body = (await request.json()) as {
    channel?: CampaignChannel;
    brief?: string;
    offer?: string;
    tone?: string;
    cta?: string;
    brandId?: string | null;
    count?: number;
  };

  if (!body.channel || (body.channel !== "sms" && body.channel !== "email")) {
    return NextResponse.json(
      { error: "channel must be sms or email" },
      { status: 400 },
    );
  }
  if (!body.brief?.trim()) {
    return NextResponse.json(
      { error: "A short creative brief is required" },
      { status: 400 },
    );
  }

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

  const result = await generateCreativeDrafts({
    channel: body.channel,
    brief: body.brief.trim(),
    offer: body.offer?.trim(),
    tone: body.tone?.trim(),
    cta: body.cta?.trim(),
    brand,
    count: body.count ?? 3,
  });

  return NextResponse.json(result);
}
