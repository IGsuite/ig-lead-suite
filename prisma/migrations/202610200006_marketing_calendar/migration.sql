ALTER TABLE "PlatformSettings" ADD COLUMN "calendarEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "MarketingCalendarEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "brandId" TEXT NOT NULL REFERENCES "Entity"("id"),
  "product" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL REFERENCES "Campaign"("id"),
  "templateId" TEXT,
  "snapshot" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "runCampaignId" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingCalendarEntry_status_check" CHECK ("status" IN ('draft','approved','paused','started','completed','skipped'))
);
CREATE UNIQUE INDEX "MarketingCalendarEntry_runCampaignId_key" ON "MarketingCalendarEntry"("runCampaignId");
CREATE INDEX "MarketingCalendarEntry_brandId_date_idx" ON "MarketingCalendarEntry"("brandId", "date");
CREATE INDEX "MarketingCalendarEntry_status_date_idx" ON "MarketingCalendarEntry"("status", "date");
