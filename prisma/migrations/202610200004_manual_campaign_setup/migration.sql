CREATE TABLE "EmailCampaignSetup" (
  "campaignId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "providerCampaignId" TEXT,
  "state" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailCampaignSetup_pkey" PRIMARY KEY ("campaignId")
);
CREATE UNIQUE INDEX "EmailCampaignSetup_providerCampaignId_key" ON "EmailCampaignSetup"("providerCampaignId");
