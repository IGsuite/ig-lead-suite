import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { canAccessEntity, isAdminSession } from "@/lib/acl";
import { getPrisma } from "@/lib/db";
import { getData } from "@/lib/store";
import { calendarInput } from "@/lib/marketing-calendar";
import { saveCalendarDrafts, changeCalendarEntries } from "@/lib/marketing-calendar-store";
import { wakeDispatcher, sendingEnabled, sendingEntityEnabled, sendingChannelEnabled } from "@/lib/dispatch-scheduler";

export async function GET(request: Request) {
  const unauthorized = await requireApiSession(); if (unauthorized) return unauthorized;
  const session = await getSession();
  const url = new URL(request.url), brandId = url.searchParams.get("brandId"), month = url.searchParams.get("month");
  if (!brandId || !month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({error:"Company and month are required"},{status:400});
  if (!canAccessEntity(session,brandId)) return NextResponse.json({error:"Forbidden"},{status:403});
  const db = getPrisma();
  const [entries,settings] = await Promise.all([
    db.marketingCalendarEntry.findMany({where:{brandId,date:{startsWith:month+"-"}},orderBy:[{date:"asc"},{startTime:"asc"}]}),
    db.platformSettings.findUniqueOrThrow({where:{id:"default"}}),
  ]);
  return NextResponse.json({entries,enabled:settings.calendarEnabled,canManage:isAdminSession(session),
    readiness:{email:sendingEnabled() && sendingEntityEnabled(brandId) && sendingChannelEnabled("email"),sms:sendingEnabled() && sendingEntityEnabled(brandId) && sendingChannelEnabled("sms")}});
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession(); if (unauthorized) return unauthorized;
  const session = await getSession();
  if (!isAdminSession(session)) return NextResponse.json({error:"Admin only"},{status:403});
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({error:"Origin not allowed"},{status:403});
  if (Number(request.headers.get("content-length") || 0) > 16000) return NextResponse.json({error:"Request too large"},{status:413});
  try {
    const body = await request.json();
    const db = getPrisma();
    if (body.action === "enable" || body.action === "disable") {
      const enabled = body.action === "enable";
      if (enabled) {
        if (!sendingEnabled()) throw new Error("Sending is paused");
        if (await db.campaign.count({where:{id:{startsWith:"camp-auto-"},status:{in:["sending","scheduled"]}}})) throw new Error("Pause active generic Autopilot campaigns before enabling the product calendar");
        const entries = await db.marketingCalendarEntry.findMany({where:{status:"approved"}});
        if (!entries.length) throw new Error("Approve at least one calendar entry before enabling");
        if (entries.some(e=>!sendingEntityEnabled(e.brandId) || !sendingChannelEnabled(e.channel))) throw new Error("Some approved entries belong to a business or channel that cannot send");
      }
      // Calendar mode and the legacy generic rotation cannot run together.
      await db.platformSettings.update({where:{id:"default"},data:{calendarEnabled:enabled,...(enabled?{autopilotEnabled:false}:{})}});
      if (enabled) try { await wakeDispatcher(); } catch {
        await db.platformSettings.update({where:{id:"default"},data:{calendarEnabled:false}});
        throw new Error("Scheduler could not start; calendar remains off. Retry later");
      }
      return NextResponse.json({enabled});
    }
    if (body.action === "approve" || body.action === "pause") {
      if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 366 || body.ids.some((id:unknown)=>typeof id !== "string")) throw new Error("Select 1–366 calendar entries");
      return NextResponse.json(await changeCalendarEntries([...new Set<string>(body.ids)],body.action));
    }
    const parsed = calendarInput.parse(body);
    await getData(); // Existing store performs first-time initialization when needed.
    const entries = await saveCalendarDrafts(parsed);
    return NextResponse.json({entries},{status:201});
  } catch (error) {
    return NextResponse.json({error:error instanceof Error ? error.message:"Unable to save calendar"},{status:400});
  }
}
