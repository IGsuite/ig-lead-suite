-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "focus" TEXT NOT NULL,
    "programs" TEXT[],
    "domain" TEXT NOT NULL,
    "sendingSubdomain" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "websiteApiUrl" TEXT NOT NULL DEFAULT '',
    "crm" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "phoneNumbers" TEXT[],
    "tenDlcStatus" TEXT NOT NULL,
    "emailAuthStatus" TEXT NOT NULL,
    "weeklySendCap" INTEGER NOT NULL DEFAULT 0,
    "rotationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "socialLinks" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "businessName" TEXT,
    "source" TEXT NOT NULL,
    "groupName" TEXT NOT NULL DEFAULT 'General',
    "purchaseDate" DATE NOT NULL,
    "costCents" INTEGER NOT NULL,
    "offeredEntityIds" TEXT[],
    "lastEntityId" TEXT,
    "convertedEntityId" TEXT,
    "status" TEXT NOT NULL,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "emailStatus" TEXT NOT NULL DEFAULT 'unverified',
    "phoneStatus" TEXT NOT NULL DEFAULT 'unverified',
    "verifyNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "uploadBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSendEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "messageFingerprint" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'own',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSendEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadBatch" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "groupName" TEXT NOT NULL DEFAULT 'General',
    "purchaseDate" DATE NOT NULL,
    "costCents" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "duplicateCount" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "htmlMessage" TEXT,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "sourceFilter" TEXT NOT NULL DEFAULT 'all',
    "groupFilter" TEXT NOT NULL DEFAULT 'all',
    "preferUnoffered" BOOLEAN NOT NULL DEFAULT true,
    "preferVerified" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL DEFAULT 'own',
    "volume" INTEGER NOT NULL,
    "throttlePerHour" INTEGER NOT NULL,
    "sendWindowPreset" TEXT NOT NULL DEFAULT 'any',
    "sendWindowStart" TEXT,
    "sendWindowEnd" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "status" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "optOutCount" INTEGER NOT NULL DEFAULT 0,
    "bounceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandId" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAsset" (
    "id" TEXT NOT NULL,
    "brandId" TEXT,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "brandId" TEXT,
    "folderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "allowedEntityIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reply" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL,
    "manualForwarded" BOOLEAN NOT NULL DEFAULT false,
    "crmSynced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptOut" (
    "id" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "brandId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderSpend" (
    "source" TEXT NOT NULL,
    "leadsPurchased" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "replies" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProviderSpend_pkey" PRIMARY KEY ("source")
);

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL,
    "brandId" TEXT,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "vendor" TEXT,
    "amountCents" INTEGER NOT NULL,
    "incurredAt" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialCampaign" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "objective" TEXT NOT NULL DEFAULT '',
    "budgetCents" INTEGER,
    "dailyBudgetCents" INTEGER,
    "targetingNotes" TEXT,
    "primaryText" TEXT,
    "cta" TEXT,
    "landingUrl" TEXT,
    "notes" TEXT,
    "creativeAssetId" TEXT,
    "creativeTemplateId" TEXT,
    "scheduleStart" TIMESTAMP(3),
    "scheduleEnd" TIMESTAMP(3),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_connected',
    "adAccountId" TEXT,
    "pixelOrEventsId" TEXT,
    "accessTokenNote" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "version" INTEGER NOT NULL DEFAULT 14,
    "mode" TEXT NOT NULL DEFAULT 'round_robin',
    "entityOrder" TEXT[],
    "notes" TEXT NOT NULL DEFAULT '',
    "autopilotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autopilotJson" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_source_idx" ON "Lead"("source");

-- CreateIndex
CREATE INDEX "Lead_groupName_idx" ON "Lead"("groupName");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_optedOut_idx" ON "Lead"("optedOut");

-- CreateIndex
CREATE INDEX "Lead_emailStatus_idx" ON "Lead"("emailStatus");

-- CreateIndex
CREATE INDEX "Lead_phoneStatus_idx" ON "Lead"("phoneStatus");

-- CreateIndex
CREATE INDEX "Lead_businessName_idx" ON "Lead"("businessName");

-- CreateIndex
CREATE INDEX "LeadSendEvent_leadId_idx" ON "LeadSendEvent"("leadId");

-- CreateIndex
CREATE INDEX "LeadSendEvent_entityId_idx" ON "LeadSendEvent"("entityId");

-- CreateIndex
CREATE INDEX "LeadSendEvent_campaignId_idx" ON "LeadSendEvent"("campaignId");

-- CreateIndex
CREATE INDEX "LeadSendEvent_channel_idx" ON "LeadSendEvent"("channel");

-- CreateIndex
CREATE INDEX "LeadSendEvent_messageFingerprint_idx" ON "LeadSendEvent"("messageFingerprint");

-- CreateIndex
CREATE INDEX "LeadSendEvent_sentAt_idx" ON "LeadSendEvent"("sentAt");

-- CreateIndex
CREATE INDEX "LeadSendEvent_leadId_messageFingerprint_idx" ON "LeadSendEvent"("leadId", "messageFingerprint");

-- CreateIndex
CREATE INDEX "LeadSendEvent_leadId_channel_sentAt_idx" ON "LeadSendEvent"("leadId", "channel", "sentAt");

-- CreateIndex
CREATE INDEX "Campaign_brandId_idx" ON "Campaign"("brandId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_mode_idx" ON "Campaign"("mode");

-- CreateIndex
CREATE INDEX "AdFolder_brandId_idx" ON "AdFolder"("brandId");

-- CreateIndex
CREATE INDEX "AdFolder_parentId_idx" ON "AdFolder"("parentId");

-- CreateIndex
CREATE INDEX "AdAsset_brandId_idx" ON "AdAsset"("brandId");

-- CreateIndex
CREATE INDEX "AdAsset_folderId_idx" ON "AdAsset"("folderId");

-- CreateIndex
CREATE INDEX "MessageTemplate_channel_idx" ON "MessageTemplate"("channel");

-- CreateIndex
CREATE INDEX "MessageTemplate_brandId_idx" ON "MessageTemplate"("brandId");

-- CreateIndex
CREATE INDEX "MessageTemplate_folderId_idx" ON "MessageTemplate"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "Reply_brandId_idx" ON "Reply"("brandId");

-- CreateIndex
CREATE INDEX "Reply_read_idx" ON "Reply"("read");

-- CreateIndex
CREATE INDEX "OptOut_contact_idx" ON "OptOut"("contact");

-- CreateIndex
CREATE INDEX "CostEntry_brandId_idx" ON "CostEntry"("brandId");

-- CreateIndex
CREATE INDEX "CostEntry_category_idx" ON "CostEntry"("category");

-- CreateIndex
CREATE INDEX "CostEntry_incurredAt_idx" ON "CostEntry"("incurredAt");

-- CreateIndex
CREATE INDEX "SocialCampaign_entityId_idx" ON "SocialCampaign"("entityId");

-- CreateIndex
CREATE INDEX "SocialCampaign_platform_idx" ON "SocialCampaign"("platform");

-- CreateIndex
CREATE INDEX "SocialCampaign_status_idx" ON "SocialCampaign"("status");

-- CreateIndex
CREATE INDEX "SocialConnection_entityId_idx" ON "SocialConnection"("entityId");

-- CreateIndex
CREATE INDEX "SocialConnection_platform_idx" ON "SocialConnection"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "SocialConnection_entityId_platform_key" ON "SocialConnection"("entityId", "platform");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES "UploadBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSendEvent" ADD CONSTRAINT "LeadSendEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSendEvent" ADD CONSTRAINT "LeadSendEvent_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSendEvent" ADD CONSTRAINT "LeadSendEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdFolder" ADD CONSTRAINT "AdFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AdFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAsset" ADD CONSTRAINT "AdAsset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AdFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AdFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialCampaign" ADD CONSTRAINT "SocialCampaign_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

