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

export const maxDuration = 300;

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const session = await getSession();
  const data = await getData();
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
    const data = await getData();
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
    const data = await getData();
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
    const data = await getData();
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
    channel: body.channel,
    subject: body.subject,
    message: body.message,
    htmlMessage,
    imageUrl,
    imageAlt,
    sourceFilter: body.sourceFilter || "all",
    groupFilter: body.groupFilter || "all",
    preferUnoffered: body.preferUnoffered ?? true,
    preferVerified: body.preferVerified ?? true,
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
