import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireApiSession } from "@/lib/api-auth";
import { uploadPrefix } from "@/lib/uploads";
export async function POST(request: Request) {
  const body = await request.json() as HandleUploadBody;
  // This endpoint only issues tokens. No completion callback is configured.
  if (body.type !== "blob.generate-client-token") return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  const denied = await requireApiSession(); if (denied) return denied;
  const prefix = await uploadPrefix();
  try {
    return NextResponse.json(await handleUpload({ request, body,
      onBeforeGenerateToken: async pathname => {
        if (!pathname.startsWith(prefix) || pathname.includes("..")) throw new Error("Invalid upload path");
        return { maximumSizeInBytes: 20 * 1024 * 1024, addRandomSuffix: true, validUntil: Date.now() + 15 * 60000 };
      },
    }));
  } catch { return NextResponse.json({ error: "Unable to authorize upload" }, { status: 400 }); }
}
