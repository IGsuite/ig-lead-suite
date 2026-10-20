import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { assertEntityAccess, isAdminSession } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import {
  createAdFolder,
  deleteAdFolder,
  getData,
  updateAdFolder,
} from "@/lib/store";

type FolderBody = {
  action?: string;
  id?: string;
  name?: string;
  brandId?: string | null;
  parentId?: string | null;
};

function assertScope(
  session: Awaited<ReturnType<typeof getSession>>,
  brandId: string | null,
) {
  if (brandId) return assertEntityAccess(session, brandId);
  if (!isAdminSession(session)) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "Only admins can manage shared Ads folders",
    };
  }
  return { ok: true as const };
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const session = await getSession();
  const payload = (await request.json()) as FolderBody;

  if (payload.action === "delete" && payload.id) {
    const data = await getData();
    const existing = (data.adFolders || []).find((f) => f.id === payload.id);
    if (!existing) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    const gate = assertScope(session, existing.brandId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const ok = await deleteAdFolder(payload.id);
    if (!ok) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  if (payload.action === "update" && payload.id) {
    const data = await getData();
    const existing = (data.adFolders || []).find((f) => f.id === payload.id);
    if (!existing) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    const gate = assertScope(session, existing.brandId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    if (!payload.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const updated = await updateAdFolder(payload.id, {
      name: payload.name.trim(),
      parentId:
        payload.parentId === undefined ? undefined : payload.parentId,
    });
    if (!updated) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  }

  if (!payload.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const brandId = payload.brandId ?? null;
  const gate = assertScope(session, brandId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  if (payload.parentId) {
    const data = await getData();
    const parent = (data.adFolders || []).find((f) => f.id === payload.parentId);
    if (!parent) {
      return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }
    if (parent.brandId !== brandId) {
      return NextResponse.json(
        { error: "Parent folder must belong to the same entity" },
        { status: 400 },
      );
    }
  }

  const folder = await createAdFolder({
    name: payload.name.trim(),
    brandId,
    parentId: payload.parentId ?? null,
  });
  return NextResponse.json(folder);
}
