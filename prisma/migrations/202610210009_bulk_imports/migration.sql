CREATE TABLE "LeadImportJob" (
 "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL UNIQUE, "ownerId" TEXT NOT NULL,
 "environment" TEXT NOT NULL, "filename" TEXT NOT NULL, "blobPath" TEXT NOT NULL,
 "csvPath" TEXT, "sizeBytes" INTEGER NOT NULL, "csvBytes" INTEGER,
 "source" TEXT NOT NULL, "groupName" TEXT NOT NULL, "purchaseDate" DATE NOT NULL,
 "costCents" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued',
 "offset" INTEGER NOT NULL DEFAULT 0, "headers" JSONB NOT NULL DEFAULT '[]',
 "rowCount" INTEGER NOT NULL DEFAULT 0, "importedCount" INTEGER NOT NULL DEFAULT 0,
 "duplicateCount" INTEGER NOT NULL DEFAULT 0, "skippedCount" INTEGER NOT NULL DEFAULT 0,
 "suppressedCount" INTEGER NOT NULL DEFAULT 0, "error" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "LeadImportJob_status_updatedAt_idx" ON "LeadImportJob"("status","updatedAt");
CREATE INDEX "LeadImportJob_ownerId_createdAt_idx" ON "LeadImportJob"("ownerId","createdAt");
CREATE TABLE "LeadImportMembership" ("jobId" TEXT NOT NULL, "leadId" TEXT NOT NULL, PRIMARY KEY("jobId","leadId"));
CREATE INDEX "LeadImportMembership_leadId_idx" ON "LeadImportMembership"("leadId");
-- Expression indexes also cover contacts created by legacy/manual/webhook paths.
CREATE OR REPLACE FUNCTION lead_email_key(value TEXT) RETURNS TEXT
 LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$ SELECT NULLIF(lower(btrim(value)), '') $$;
CREATE OR REPLACE FUNCTION lead_phone_key(value TEXT) RETURNS TEXT
 LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE WHEN length(d)=11 AND left(d,1)='1' THEN substring(d from 2) ELSE NULLIF(d,'') END
 FROM (SELECT regexp_replace(value,'[^0-9]','','g') AS d) AS normalized $$;
CREATE INDEX "Lead_email_key_idx" ON "Lead"(lead_email_key("email"));
CREATE INDEX "Lead_phone_key_idx" ON "Lead"(lead_phone_key("phone"));
CREATE INDEX "OptOut_email_key_idx" ON "OptOut"(lead_email_key("contact"));
CREATE INDEX "OptOut_phone_key_idx" ON "OptOut"(lead_phone_key("contact"));
CREATE INDEX "Lead_createdAt_id_idx" ON "Lead"("createdAt" DESC,"id" DESC);
CREATE INDEX "Lead_uploadBatchId_idx" ON "Lead"("uploadBatchId");
CREATE INDEX "Lead_manualPackages_idx" ON "Lead" USING GIN("manualPackages");
CREATE INDEX "Reply_leadId_channel_idx" ON "Reply"("leadId","channel");
