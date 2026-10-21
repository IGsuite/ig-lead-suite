import { getPrisma } from "@/lib/db";
import { mapLead } from "@/lib/mappers";
import type { LeadPoolSummary, PlatformData } from "@/lib/types";

/** Database aggregates replace browser-wide contact downloads. No lead sampling in totals. */
export async function attachLeadSummary(data: PlatformData) {
  const db=getPrisma();
  const [counts,byBrand,rollups,sourceGroups,packages,context]=await Promise.all([
    db.$queryRaw<{total:bigint;fresh:bigint;suppressed:bigint}[]>`SELECT count(*) AS total,count(*) FILTER(WHERE NOT "optedOut" AND cardinality("offeredEntityIds")=0) AS fresh,count(*) FILTER(WHERE "optedOut") AS suppressed FROM "Lead"`,
    db.$queryRaw<{id:string;offered:bigint;open:bigint;conversions:bigint}[]>`SELECT e.id,
      count(l.id) FILTER(WHERE e.id=ANY(l."offeredEntityIds")) AS offered,
      count(l.id) FILTER(WHERE NOT l."optedOut" AND l.status<>'converted' AND NOT e.id=ANY(l."offeredEntityIds")) AS open,
      count(l.id) FILTER(WHERE l."convertedEntityId"=e.id) AS conversions
      FROM "Entity" e LEFT JOIN "Lead" l ON TRUE GROUP BY e.id`,
    db.$queryRaw<(LeadPoolSummary["rollups"][number])[]>`WITH scoped AS (
      SELECT l.*, 'all'::text AS "brandId" FROM "Lead" l
      UNION ALL SELECT l.*, unnest(l."offeredEntityIds") AS "brandId" FROM "Lead" l
    ) SELECT "brandId",source,c.channel,
      count(*)::int AS offered,
      count(*) FILTER(WHERE coalesce(phone,'')<>'')::int AS "phoneCapable",
      count(*) FILTER(WHERE coalesce(email,'')<>'')::int AS "emailCapable",
      count(*) FILTER(WHERE (s.status='converted' OR s."convertedEntityId" IS NOT NULL)
        AND (s."brandId"='all' OR s."convertedEntityId"=s."brandId" OR (s.status='converted' AND s."lastEntityId"=s."brandId"))
        AND (c.channel='all' OR EXISTS(SELECT 1 FROM "Reply" r WHERE r."leadId"=s.id AND r.channel=c.channel AND (s."brandId"='all' OR r."brandId"=s."brandId"))))::int AS conversions,
      coalesce(sum("costCents"),0)::bigint AS "costCents"
      FROM scoped s CROSS JOIN (VALUES('all'),('email'),('sms')) c(channel)
      WHERE (c.channel='all' AND (coalesce(email,'')<>'' OR coalesce(phone,'')<>'')) OR (c.channel='email' AND coalesce(email,'')<>'') OR (c.channel='sms' AND coalesce(phone,'')<>'')
      GROUP BY "brandId",source,c.channel`,
    db.lead.groupBy({by:["source","groupName"]}),
    db.$queryRaw<{id:string;name:string;count:bigint}[]>`SELECT p->>'id' AS id,p->>'name' AS name,count(*) FROM "Lead",jsonb_array_elements("manualPackages") p GROUP BY p->>'id',p->>'name' ORDER BY name`,
    // Inbox names and a small pool preview are the only contact rows required globally.
    db.lead.findMany({where:{OR:[{id:{in:data.replies.map(r=>r.leadId)}},{id:{in:(await db.lead.findMany({select:{id:true},orderBy:[{createdAt:"desc"},{id:"desc"}],take:100})).map(l=>l.id)}}]}}),
  ]);
  const summary:LeadPoolSummary={total:Number(counts[0].total),fresh:Number(counts[0].fresh),suppressed:Number(counts[0].suppressed),
    sources:[...new Set(sourceGroups.map(s=>s.source))].sort(),groups:[...new Set(sourceGroups.map(s=>s.groupName))].sort(),
    packages:packages.map(p=>({...p,count:Number(p.count)})),
    byBrand:Object.fromEntries(byBrand.map(b=>[b.id,{offered:Number(b.offered),open:Number(b.open),conversions:Number(b.conversions)}])),
    rollups:rollups.map(r=>({...r,costCents:Number(r.costCents)}))};
  return {...data,leads:context.map(mapLead),leadSummary:summary};
}
