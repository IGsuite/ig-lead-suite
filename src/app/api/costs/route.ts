import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { assertEntityAccess, canAccessEntity, isAdminSession } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import { createCostEntry, deleteCostEntry, getData } from "@/lib/store";
import type { CostCategory } from "@/lib/types";

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const session = await getSession();
  const data = await getData({ leadLimit: 0 });
  const entries = (data.costEntries || []).filter(
    (e) => !e.brandId || canAccessEntity(session, e.brandId),
  );
  return NextResponse.json(entries);
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const session = await getSession();
  const body = (await request.json()) as {
    brandId?: string | null;
    category?: CostCategory;
    label?: string;
    vendor?: string;
    amountDollars?: number;
    amountCents?: number;
    incurredAt?: string;
    notes?: string;
  };

  if (!body.category || !body.label) {
    return NextResponse.json(
      { error: "category and label are required" },
      { status: 400 },
    );
  }

  if (body.brandId) {
    const gate = assertEntityAccess(session, body.brandId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
  } else if (!isAdminSession(session)) {
    return NextResponse.json(
      { error: "Only admins can log shared overhead" },
      { status: 403 },
    );
  }

  const amountCents =
    typeof body.amountCents === "number"
      ? Math.round(body.amountCents)
      : Math.round(Number(body.amountDollars || 0) * 100);

  if (!Number.isFinite(amountCents)) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const entry = await createCostEntry({
    brandId: body.brandId === undefined ? null : body.brandId,
    category: body.category,
    label: body.label.trim(),
    vendor: body.vendor?.trim() || undefined,
    amountCents,
    incurredAt: body.incurredAt || new Date().toISOString().slice(0, 10),
    notes: body.notes?.trim() || undefined,
  });

  return NextResponse.json(entry);
}

export async function DELETE(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const session = await getSession();
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const ok = await deleteCostEntry(id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
