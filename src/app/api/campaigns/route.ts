import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { assertEntityAccess, canAccessEntity } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import {
  createCampaign,
  getData,
  launchCampaign,
  setCampaignStatus,
} from "@/lib/store";
import type {
  CampaignChannel,
  CampaignPoolMode,
  SendWindowPreset,
} from "@/lib/types";
import { normalizeSendWindow } from "@/lib/send-window";
import { updateDraftAudience } from "@/lib/campaign-audience";
import { validatePrograms } from "@/lib/programs";
import { mapCampaign } from "@/lib/mappers";

export const maxDuration = 300;

export async function PATCH(request: Request) {
  const unauthorized = await requireApiSession(); if (unauthorized) return unauthorized;
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({error:"Origin not allowed"},{status:403});
  const session = await getSession();
  const body = await request.json().catch(()=>null) as {id?:unknown;sourceFilter?:unknown;groupFilter?:unknown;mode?:unknown} | null;
  if (body?.mode !== undefined && body.mode !== "own" && body.mode !== "auto") return NextResponse.json({error:"Choose one-time or automatic"},{status:400});
  if (!body || typeof body.id !== "string" || typeof body.sourceFilter !== "string" || typeof body.groupFilter !== "string" || !body.sourceFilter.trim() || !body.groupFilter.trim() || body.sourceFilter.length>1000 || body.groupFilter.length>1000)
    return NextResponse.json({error:"Campaign, source and group are required"},{status:400});
  const data = await getData({ leadLimit: 0 }), campaign = data.campaigns.find(c=>c.id === body.id);
  if (!campaign) return NextResponse.json({error:"Campaign not found"},{status:404});
  const gate = assertEntityAccess(session,campaign.brandId);
  if (!gate.ok) return NextResponse.json({error:gate.error},{status:gate.status});
  try {return NextResponse.json(mapCampaign(await updateDraftAudience(body.id,body.sourceFilter.trim(),body.groupFilter.trim(),body.mode as "own"|"auto"|undefined)));}
  catch(error) {return NextResponse.json({error:error instanceof Error?error.message:"Unable to save audience"},{status:409});}
}

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const session = await getSession();
  const data = await getData({ leadLimit: 0 });
  const campaigns = data.campaigns.filter((c) =>
    canAccessEntity(session, c.brandId),
  );
  return NextResponse.json(campaigns);
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const session = await getSession();
  const body = (await request.json()) as {
    action?: "launch" | "pause" | "cancel" | string;
    id?: string;
    brandId?: string;
    name?: string;
    programs?: string[];
    channel?: CampaignChannel;
    subject?: string;
    message?: string;
    htmlMessage?: string | null;
    imageUrl?: string | null;
    imageAlt?: string | null;
    sourceFilter?: string;
    groupFilter?: string;
    preferUnoffered?: boolean;
    preferVerified?: boolean;
    mode?: CampaignPoolMode;
    volume?: number;
    throttlePerHour?: number;
    sendWindowPreset?: SendWindowPreset;
    sendWindowStart?: string;
    sendWindowEnd?: string;
    timezone?: string;
    status?: "draft" | "scheduled";
  };

  if (body.action === "launch" && body.id) {
    const data = await getData({ leadLimit: 0 });
    const existing = data.campaigns.find((c) => c.id === body.id);
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    const gate = assertEntityAccess(session, existing.brandId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    let result;
    try { result = await launchCampaign(body.id); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to queue campaign" }, { status: 409 }); }
    if (!result) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...result.campaign,
      deferred: result.deferred,
      deferredReason: result.reason,
      windowLabel: result.windowLabel,
      emptyAudience: result.emptyAudience ?? false,
      eligibleCount: result.eligibleCount,
    });
  }

  if (body.action === "cancel" && body.id) {
    const data = await getData({ leadLimit: 0 });
    const existing = data.campaigns.find((c) => c.id === body.id);
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    const gate = assertEntityAccess(session, existing.brandId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    if (
      existing.status === "completed" ||
      existing.status === "cancelled"
    ) {
      return NextResponse.json(
        { error: `Campaign already ${existing.status}` },
        { status: 400 },
      );
    }
    const updated = await setCampaignStatus(body.id, "cancelled");
    if (!updated) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  }

  if (body.action === "pause" && body.id) {
    const data = await getData({ leadLimit: 0 });
    const existing = data.campaigns.find((c) => c.id === body.id);
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    const gate = assertEntityAccess(session, existing.brandId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const updated = await setCampaignStatus(body.id, "paused");
    if (!updated) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  }

  if (
    !body.brandId ||
    !body.name ||
    !body.channel ||
    !body.message ||
    !body.volume ||
    !body.throttlePerHour
  ) {
    return NextResponse.json({ error: "Missing campaign fields" }, { status: 400 });
  }

  const gate = assertEntityAccess(session, body.brandId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let programs: string[];
  try { const data = await getData({ leadLimit: 0 }); programs = validatePrograms(data.brands.find(b=>b.id===body.brandId),body.programs); }
  catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Invalid programs"},{status:400}); }

  const win = normalizeSendWindow({
    sendWindowPreset: body.sendWindowPreset,
    sendWindowStart: body.sendWindowStart,
    sendWindowEnd: body.sendWindowEnd,
    timezone: body.timezone,
  });

  const imageUrl =
    body.channel === "email" && body.imageUrl?.trim()
      ? body.imageUrl.trim()
      : null;
  const imageAlt =
    body.channel === "email" && body.imageAlt?.trim()
      ? body.imageAlt.trim()
      : null;
  const htmlMessage =
    body.channel === "email" && body.htmlMessage?.trim()
      ? body.htmlMessage.trim()
      : null;

  const campaign = await createCampaign({
    brandId: body.brandId,
    name: body.name,
    programs,
    channel: body.channel,
    subject: body.subject,
    message: body.message,
    htmlMessage,
    imageUrl,
    imageAlt,
    sourceFilter: body.sourceFilter || "all",
    groupFilter: body.groupFilter || "all",
    preferUnoffered: body.mode === "auto" ? false : body.preferUnoffered ?? true,
    preferVerified: body.mode === "auto" ? true : body.preferVerified ?? true,
    mode: body.mode === "auto" ? "auto" : "own",
    volume: body.volume,
    throttlePerHour: body.throttlePerHour,
    sendWindowPreset: win.sendWindowPreset,
    sendWindowStart: win.sendWindowStart,
    sendWindowEnd: win.sendWindowEnd,
    timezone: win.timezone,
    // Saving never authorizes sending. Only the separate Launch action can arm a campaign.
    status: "draft",
  });

  return NextResponse.json(campaign);
}
