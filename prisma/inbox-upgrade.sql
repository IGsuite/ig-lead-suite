-- Additive, repeatable upgrade. Run before deploying the inbox code.
ALTER TABLE "Reply" ADD COLUMN IF NOT EXISTS "providerContext" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS "InboxSend" (
  "id" TEXT PRIMARY KEY,
  "replyId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "from" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "providerId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "InboxSend_brandId_leadId_channel_idx" ON "InboxSend"("brandId", "leadId", "channel");
