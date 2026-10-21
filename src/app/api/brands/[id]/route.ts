import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { assertEntityAccess, isAdminSession } from "@/lib/acl";
import { entitySourceResults } from "@/lib/analytics";
import { getSession } from "@/lib/auth";
import { getData, updateBrand } from "@/lib/store";
import type { Brand } from "@/lib/types";
import { attachLeadSummary } from "@/lib/lead-summary";
import { getPrisma, isNeonConfigured } from "@/lib/db";
import { mapLead } from "@/lib/mappers";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  const session = await getSession();
  const gate = assertEntityAccess(session, id);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  let data = await getData({leadLimit:0});
  if(isNeonConfigured())data=await attachLeadSummary(data);
  const brand = data.brands.find((b) => b.id === id);
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  return NextResponse.json({
    brand,
    campaigns: data.campaigns.filter((c) => c.brandId === id),
    leads: isNeonConfigured()?(await getPrisma().lead.findMany({where:{offeredEntityIds:{has:id}},take:100,orderBy:{createdAt:"desc"}})).map(mapLead):data.leads.filter((l) => l.offeredEntityIds.includes(id)),
    offeredCount:data.leadSummary?.byBrand[id]?.offered,
    replies: data.replies.filter((r) => r.brandId === id),
    sourceResults: entitySourceResults(data, id),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  const session = await getSession();
  const gate = assertEntityAccess(session, id);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  // Members can view; only admins change entity config
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const patch = (await request.json()) as Partial<Brand>;
  const brand = await updateBrand(id, patch);
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  return NextResponse.json(brand);
}
