import { handleCallback } from "@vercel/queue";
import { processBulkImport } from "@/lib/bulk-import";
export const maxDuration = 300;
const callback = handleCallback<{ id: string }>(async message => {
  if (typeof message.id === "string") await processBulkImport(message.id);
}, { retry: (_error, metadata) => metadata.deliveryCount >= 5 ? { acknowledge: true } : { afterSeconds: 60 } });

export async function POST(request: Request): Promise<Response> {
  return callback(request);
}
