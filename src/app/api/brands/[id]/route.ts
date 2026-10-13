import { NextResponse } from "next/server";
import { getData, updateBrand } from "@/lib/store";
import type { Brand } from "@/lib/types";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const data = await getData();
  const brand = data.brands.find((b) => b.id === id);
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  return NextResponse.json({
    brand,
    campaigns: data.campaigns.filter((c) => c.brandId === id),
    leads: data.leads.filter((l) => l.offeredEntityIds.includes(id)),
    replies: data.replies.filter((r) => r.brandId === id),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const patch = (await request.json()) as Partial<Brand>;
  const brand = await updateBrand(id, patch);
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  return NextResponse.json(brand);
}
