import { del } from "@vercel/blob";
import { formWithUploadedFile } from "@/lib/uploads";
import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { writeAdAssetFile } from "@/lib/ad-assets-fs";
import { assertEntityAccess, isAdminSession } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import {
  createAdAsset,
  deleteAdAsset,
  getData,
  updateAdAsset,
} from "@/lib/store";

const MAX_BYTES = 8 * 1024 * 1024;

function assertScope(
  session: Awaited<ReturnType<typeof getSession>>,
  brandId: string | null,
) {
  if (brandId) return assertEntityAccess(session, brandId);
  if (!isAdminSession(session)) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "Only admins can manage shared Ads files",
    };
  }
  return { ok: true as const };
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const session = await getSession();
  const contentType = request.headers.get("content-type") || "";

  const blobUpload = contentType.includes("application/json") && Boolean((await request.clone().json().catch(() => ({}))).blobPath);
  if (contentType.includes("multipart/form-data") || blobUpload) {
    const reference = blobUpload ? (await request.clone().json()).blobPath : undefined;
    const form = await formWithUploadedFile(request, MAX_BYTES);
    const action = String(form.get("action") || "create");
    if (action === "delete") {
      const id = String(form.get("id") || "");
      if (!id) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      const data = await getData();
      const existing = (data.adAssets || []).find((a) => a.id === id);
      if (!existing) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }
      const gate = assertScope(session, existing.brandId);
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: gate.status });
      }
      const ok = await deleteAdAsset(id);
      if (!ok) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File too large (max 8MB)" },
        { status: 400 },
      );
    }

    const brandRaw = form.get("brandId");
    const brandId =
      brandRaw === null || brandRaw === "" || brandRaw === "shared"
        ? null
        : String(brandRaw);
    const gate = assertScope(session, brandId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const folderRaw = form.get("folderId");
    const folderId =
      folderRaw === null || folderRaw === "" || folderRaw === "__root__"
        ? null
        : String(folderRaw);

    if (folderId) {
      const data = await getData();
      const folder = (data.adFolders || []).find((f) => f.id === folderId);
      if (!folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }
      if (folder.brandId !== brandId) {
        return NextResponse.json(
          { error: "Folder must belong to the same entity" },
          { status: 400 },
        );
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const written = await writeAdAssetFile({
      brandId,
      originalName: file.name,
      buffer,
    });
    const displayName =
      String(form.get("name") || "").trim() ||
      file.name.replace(/\.[^.]+$/, "") ||
      file.name;

    const asset = await createAdAsset({
      brandId,
      folderId,
      name: displayName,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: written.sizeBytes,
      storagePath: written.storagePath,
    });
    if (reference) await del(reference).catch(() => undefined);
    return NextResponse.json(asset);
  }

  const payload = (await request.json()) as {
    action?: string;
    id?: string;
    name?: string;
    folderId?: string | null;
  };

  if (payload.action === "delete" && payload.id) {
    const data = await getData();
    const existing = (data.adAssets || []).find((a) => a.id === payload.id);
    if (!existing) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    const gate = assertScope(session, existing.brandId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const ok = await deleteAdAsset(payload.id);
    if (!ok) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  if (payload.action === "update" && payload.id) {
    const data = await getData();
    const existing = (data.adAssets || []).find((a) => a.id === payload.id);
    if (!existing) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    const gate = assertScope(session, existing.brandId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const updated = await updateAdAsset(payload.id, {
      name: payload.name?.trim() || undefined,
      folderId: payload.folderId === undefined ? undefined : payload.folderId,
    });
    if (!updated) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Unsupported request" }, { status: 400 });
}
