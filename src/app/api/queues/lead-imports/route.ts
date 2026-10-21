import { handleCallback } from "@vercel/queue";
import { processBulkImport } from "@/lib/bulk-import";
export const maxDuration = 300;
export const POST = handleCallback<{ id: string }>(async message => {
  if (typeof message.id === "string") await processBulkImport(message.id);
}, { retry: (_error, metadata) => metadata.deliveryCount >= 5 ? { acknowledge: true } : { afterSeconds: 60 } });
