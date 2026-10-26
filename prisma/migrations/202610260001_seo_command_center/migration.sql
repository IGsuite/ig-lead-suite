CREATE TABLE "SeoProject" (
 "entityId" TEXT PRIMARY KEY REFERENCES "Entity"("id"), "providerProjectId" TEXT NOT NULL,
 "website" TEXT NOT NULL, "automaticSync" BOOLEAN NOT NULL DEFAULT false,
 "lastCheckedAt" TIMESTAMP(3), "syncError" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "SeoReport" (
 "id" TEXT PRIMARY KEY, "entityId" TEXT NOT NULL REFERENCES "Entity"("id"),
 "providerProjectId" TEXT NOT NULL, "auditedAt" TIMESTAMP(3) NOT NULL, "source" TEXT NOT NULL,
 "healthScore" INTEGER NOT NULL CHECK ("healthScore" BETWEEN 0 AND 100),
 "internalPages" INTEGER NOT NULL CHECK ("internalPages">=0),
 "errorUrls" INTEGER NOT NULL CHECK ("errorUrls">=0 AND "errorUrls"<="internalPages"),
 "complete" BOOLEAN NOT NULL DEFAULT false, "findings" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SeoReport_entityId_providerProjectId_auditedAt_key" ON "SeoReport"("entityId","providerProjectId","auditedAt");
CREATE INDEX "SeoReport_entityId_auditedAt_idx" ON "SeoReport"("entityId","auditedAt");
CREATE TABLE "SeoTask" (
 "id" TEXT PRIMARY KEY, "entityId" TEXT NOT NULL REFERENCES "Entity"("id"), "providerProjectId" TEXT NOT NULL,
 "issueKey" TEXT NOT NULL, "title" TEXT NOT NULL, "priority" TEXT NOT NULL CHECK ("priority" IN ('error','warning','notice')),
 "affectedCount" INTEGER NOT NULL CHECK ("affectedCount">=0), "recommendation" TEXT NOT NULL,
 "urls" TEXT[] NOT NULL, "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','in_progress','fix_reported','verified_fixed')),
 "assignee" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '',
 "firstSeenAt" TIMESTAMP(3) NOT NULL, "lastSeenAt" TIMESTAMP(3) NOT NULL,
 "verifiedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "SeoTask_entityId_providerProjectId_issueKey_key" ON "SeoTask"("entityId","providerProjectId","issueKey");
CREATE INDEX "SeoTask_entityId_status_idx" ON "SeoTask"("entityId","status");
CREATE TABLE "SeoAlert" (
 "id" TEXT PRIMARY KEY, "entityId" TEXT NOT NULL REFERENCES "Entity"("id"),
 "reportId" TEXT UNIQUE REFERENCES "SeoReport"("id"), "message" TEXT NOT NULL,
 "acknowledgedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SeoAlert_entityId_acknowledgedAt_idx" ON "SeoAlert"("entityId","acknowledgedAt");
