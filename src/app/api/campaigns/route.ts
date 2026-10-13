import { NextResponse } from "next/server";
import { createCampaign, getData, launchCampaign } from "@/lib/store";
import type { CampaignChannel } from "@/lib/types";

export async function GET() {
  const data = await getData();
  return NextResponse.json(data.campaigns);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: string;
    id?: string;
    brandId?: string;
    name?: string;
    channel?: CampaignChannel;
    subject?: string;
    message?: string;
    sourceFilter?: string;
    volume?: number;
    throttlePerHour?: number;
    status?: "draft" | "scheduled";
  };

  if (body.action === "launch" && body.id) {
    const campaign = await launchCampaign(body.id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json(campaign);
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

  const campaign = await createCampaign({
    brandId: body.brandId,
    name: body.name,
    channel: body.channel,
    subject: body.subject,
    message: body.message,
    sourceFilter: body.sourceFilter || "all",
    volume: body.volume,
    throttlePerHour: body.throttlePerHour,
    status: body.status || "draft",
  });

  return NextResponse.json(campaign);
}
