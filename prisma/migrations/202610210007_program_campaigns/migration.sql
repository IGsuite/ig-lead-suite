ALTER TABLE "Campaign" ADD COLUMN "programs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MessageTemplate" ADD COLUMN "programs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Entity" SET "programs" = ARRAY['HELOC','SBA 7(a)','SBA 504','SBA Express','Business Line of Credit','Revenue-Based Financing / MCA','Term Loans','Equipment Financing','Invoice Factoring','Small Business Loans'] WHERE id = 'abstract';
UPDATE "Campaign" SET "programs" = ARRAY['HELOC'] WHERE "brandId" = 'abstract' AND "name" ILIKE '%HELOC%';
UPDATE "Campaign" SET "programs" = ARRAY['Revenue-Based Financing / MCA'] WHERE "brandId" = 'abstract' AND "name" ILIKE '%MCA%' AND cardinality("programs")=0;
UPDATE "MessageTemplate" SET "programs" = ARRAY['HELOC'] WHERE "brandId" = 'abstract' AND "name" ILIKE '%HELOC%';
UPDATE "MessageTemplate" SET "programs" = ARRAY['Revenue-Based Financing / MCA'] WHERE "brandId" = 'abstract' AND "name" ILIKE '%MCA%' AND cardinality("programs")=0;
UPDATE "MarketingCalendarEntry" e SET "snapshot" = jsonb_set(e."snapshot", '{programs}', to_jsonb(c."programs"), true)
FROM "Campaign" c WHERE e."campaignId"=c.id AND cardinality(c."programs")>0;
