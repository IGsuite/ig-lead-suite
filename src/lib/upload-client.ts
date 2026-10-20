"use client";
import { upload } from "@vercel/blob/client";
/** Preserve existing forms and visuals; only the transport changes for hosted uploads. */
export async function uploadFileToApi(endpoint: string, form: FormData) {
  const configResponse = await fetch("/api/uploads/config");
  if (!configResponse.ok) throw new Error("Upload storage is not available");
  const config = await configResponse.json() as { enabled: boolean; prefix: string };
  if (!config.enabled) return fetch(endpoint, { method: "POST", body: form });
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Choose a file");
  const name = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = await upload(`${config.prefix}${crypto.randomUUID()}/${name}`, file, { access: "private", handleUploadUrl: "/api/uploads/token" });
  const fields = Object.fromEntries([...form.entries()].filter(([key]) => key !== "file"));
  return fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blobPath: blob.pathname, filename: file.name, mimeType: file.type, fields }) });
}
