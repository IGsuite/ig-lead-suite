import { NextResponse } from "next/server";
import { emailProviderName } from "@/lib/providers/email";
import { isTelnyxConfigured } from "@/lib/providers/telnyx";
import { isNeonConfigured } from "@/lib/store";

export async function GET() {
  return NextResponse.json({
    neon: isNeonConfigured() ? "live" : "local",
    telnyx: isTelnyxConfigured() ? "live" : "mock",
    email: emailProviderName(),
  });
}
