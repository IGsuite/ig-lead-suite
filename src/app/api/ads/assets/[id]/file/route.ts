import { NextResponse } from "next/server";
import { readAdAssetFile } from "@/lib/ad-assets-fs";
import { assertEntityAccess, isAdminSession } from "@/lib/acl";
import { getSession } from "@/lib/auth";
import { getData } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const session = await getSession();
  const data = await getData();
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
