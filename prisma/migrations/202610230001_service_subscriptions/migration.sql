CREATE TABLE "ServiceSubscription" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "companyIds" TEXT[] NOT NULL,
 "service" TEXT NOT NULL,
 "purpose" TEXT NOT NULL,
 "loginUrl" TEXT NOT NULL,
 "username" TEXT NOT NULL DEFAULT '',
 "vaultUrl" TEXT NOT NULL DEFAULT '',
 "plan" TEXT NOT NULL DEFAULT '',
 "amountCents" INTEGER,
 "currency" TEXT NOT NULL DEFAULT 'USD',
 "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
 "renewalDate" TEXT NOT NULL DEFAULT '',
 "status" TEXT NOT NULL DEFAULT 'needs_review',
 "notes" TEXT NOT NULL DEFAULT '',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ServiceSubscription_amount_check" CHECK ("amountCents" IS NULL OR "amountCents" >= 0)
);
CREATE INDEX "ServiceSubscription_companyIds_idx" ON "ServiceSubscription" USING GIN ("companyIds");
