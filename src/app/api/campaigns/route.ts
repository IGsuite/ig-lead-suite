import { NextResponse } from "next/server";
import { assertEntityAccess, canAccessEntity } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import { createCampaign, getData, launchCampaign } from "@/lib/store";
import type {
  CampaignChannel,
  CampaignPoolMode,
  SendWindowPreset,
} from "@/lib/types";
import { normalizeSendWindow } from "@/lib/send-window";

export async function GET() {
  const session = await getSession();
  const data = await getData();
  const campaigns = data.campaigns.filter((c) =>
    canAccessEntity(session, c.brandId),
  );
  return NextResponse.json(campaigns);
}

export async function POST(request: Request) {
  const session = await getSession();
  const body = (await request.json()) as {
    action?: string;
    id?: string;
    brandId?: string;
    name?: string;
    channel?: CampaignChannel;
    subject?: string;
    message?: string;
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
    const result = await launchCampaign(body.id);
    if (!result) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...result.campaign,
      deferred: result.deferred,
      deferredReason: result.reason,
      windowLabel: result.windowLabel,
    });
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

  const campaign = await createCampaign({
    brandId: body.brandId,
    name: body.name,
    channel: body.channel,
    subject: body.subject,
    message: body.message,
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
    status: body.status || "draft",
  });

  return NextResponse.json(campaign);
}
