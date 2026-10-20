import { get, head } from "@vercel/blob";
import { getSession, isProductionDeploy } from "@/lib/auth";

export function blobConfigured() { return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID); }
export async function uploadPrefix() {
  const session = await getSession();
  return `uploads/${session?.userId || "local"}/`;
}
/** Only read private blobs in the authenticated uploader's namespace. Never fetch caller URLs. */
export async function formWithUploadedFile(request: Request, maxBytes: number): Promise<FormData> {
  if (!(request.headers.get("content-type") || "").includes("application/json")) return request.formData();
  const body = await request.json() as { blobPath?: string; filename?: string; mimeType?: string; fields?: Record<string, string> };
  if (!body.blobPath?.startsWith(await uploadPrefix()) || body.blobPath.includes("..")) throw new Error("Invalid upload reference");
  const metadata = await head(body.blobPath);
  if (metadata.size > maxBytes) throw new Error("File too large");
  const blob = await get(body.blobPath, { access: "private" });
  if (!blob || blob.statusCode !== 200) throw new Error("Uploaded file not found");
  const bytes = await new Response(blob.stream).arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error("File too large");
  const form = new FormData();
  for (const [key, value] of Object.entries(body.fields || {})) form.set(key, value);
  form.set("file", new File([bytes], body.filename || "upload", { type: body.mimeType || "application/octet-stream" }));
  return form;
}
export function requireProductionBlob() {
  if (isProductionDeploy() && !blobConfigured()) throw new Error("Private Blob storage must be configured in production");
}
