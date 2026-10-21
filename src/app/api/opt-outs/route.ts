import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { applyOptOut, getData } from "@/lib/store";
import type { OptOut } from "@/lib/types";

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const data = await getData({ leadLimit: 0 });
  return NextResponse.json(data.optOuts);
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const body = (await request.json()) as {
    contact?: string;
    channel?: OptOut["channel"];
    reason?: string;
    brandId?: string | null;
  };

  if (!body.contact || !body.channel) {
    return NextResponse.json(
      { error: "Contact and channel are required" },
      { status: 400 },
    );
  }

  const opt = await applyOptOut({
    contact: body.contact,
    channel: body.channel,
    reason: body.reason || "Manual opt-out",
    brandId: body.brandId ?? null,
  });

  return NextResponse.json(opt);
}
