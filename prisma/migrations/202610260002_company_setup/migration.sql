CREATE TABLE "CompanySetupItem" (
 "id" TEXT PRIMARY KEY,"entityId" TEXT NOT NULL REFERENCES "Entity"("id"),"key" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'not_started' CHECK ("status" IN ('not_started','in_progress','needs_owner','ready_for_review','tested','not_applicable')),
 "accountName" TEXT NOT NULL DEFAULT '',"username" TEXT NOT NULL DEFAULT '',"loginUrl" TEXT NOT NULL DEFAULT '',
 "profileUrl" TEXT NOT NULL DEFAULT '',"vaultUrl" TEXT NOT NULL DEFAULT '',"accountReference" TEXT NOT NULL DEFAULT '',
 "assignee" TEXT NOT NULL DEFAULT '',"notes" TEXT NOT NULL DEFAULT '',"updatedBy" TEXT NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "CompanySetupItem_entityId_key_key" ON "CompanySetupItem"("entityId","key");
CREATE INDEX "CompanySetupItem_entityId_status_idx" ON "CompanySetupItem"("entityId","status");
CREATE TABLE "CompanySetupEvent" (
 "id" TEXT PRIMARY KEY,"entityId" TEXT NOT NULL REFERENCES "Entity"("id"),"itemKey" TEXT NOT NULL,
 "message" TEXT NOT NULL,"acknowledgedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CompanySetupEvent_entityId_createdAt_idx" ON "CompanySetupEvent"("entityId","createdAt");
CREATE TABLE "CompanyAccountCredential" (
 "id" TEXT PRIMARY KEY,"entityId" TEXT NOT NULL REFERENCES "Entity"("id"),"key" TEXT NOT NULL,
 "encryptedValue" TEXT NOT NULL,"revision" INTEGER NOT NULL DEFAULT 1,
 "updatedBy" TEXT NOT NULL,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "CompanyAccountCredential_entityId_key_key" ON "CompanyAccountCredential"("entityId","key");
