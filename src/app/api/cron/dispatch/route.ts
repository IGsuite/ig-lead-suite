import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { dispatchQueuedSends } from "@/lib/send-queue";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) return NextResponse.json({ error: "Scheduler is not configured" }, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await dispatchQueuedSends());
}
