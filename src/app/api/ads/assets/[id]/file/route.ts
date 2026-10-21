import { get } from "@vercel/blob";
import { requireApiSession } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { readAdAssetFile } from "@/lib/ad-assets-fs";
import { assertEntityAccess, isAdminSession } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import { getData } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const session = await getSession();
  const data = await getData({ leadLimit: 0 });
  const asset = (data.adAssets || []).find((a) => a.id === id);
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  if (asset.brandId) {
    const gate = assertEntityAccess(session, asset.brandId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
  } else if (!isAdminSession(session)) {
    // Members may download shared files (shared templates are also visible)
  }

  try {
    if (asset.storagePath.startsWith("blob:")) {
      const file = await get(asset.storagePath.slice(5), { access: "private" });
      if (!file || file.statusCode !== 200) return NextResponse.json({ error: "File missing" }, { status: 404 });
      return new NextResponse(file.stream, { headers: { "Content-Type": asset.mimeType, "Content-Disposition": `attachment; filename="${asset.originalName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`, "Cache-Control": "private, no-store" } });
    }
    const buffer = await readAdAssetFile(asset.storagePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": asset.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${asset.originalName.replace(/"/g, "")}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  }
}
