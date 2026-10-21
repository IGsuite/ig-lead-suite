import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { assertEntityAccess } from "@/lib/acl";
import { getPrisma } from "@/lib/db";
import { parseAudienceFilter, AUDIENCE_NOT_SELECTED, audienceContactKey } from "@/lib/audience-filters";
import { mapLead } from "@/lib/mappers";
import { isLeadEligibleForEntity } from "@/lib/eligibility";
export const maxDuration=300;
export async function GET(request:Request){
 const denied=await requireApiSession();if(denied)return denied;
 const params=new URL(request.url).searchParams,brandId=params.get("brandId")||"",channel=params.get("channel")==="sms"?"sms":"email";
 const gate=assertEntityAccess(await getSession(),brandId);if(!gate.ok)return NextResponse.json({error:gate.error},{status:403});
 const source=params.get("source")||"all",group=params.get("group")||"all",preferUnoffered=params.get("unoffered")==="true",preferVerified=params.get("verified")!=="false";
 if(source===AUDIENCE_NOT_SELECTED||group===AUDIENCE_NOT_SELECTED)return NextResponse.json({count:0});
 const db=getPrisma(),clauses:Prisma.Sql[]=[Prisma.sql`NOT l."optedOut" AND l.status NOT IN ('opted_out','converted') AND l."convertedEntityId" IS NULL`];
 const sources=parseAudienceFilter(source),groups=parseAudienceFilter(group);
 if(sources!=="all")clauses.push(Prisma.sql`(${Prisma.join(sources.map(s=>s.startsWith("manual-package:")?Prisma.sql`l."manualPackages" @> ${JSON.stringify([{id:s.slice(15)}])}::jsonb`:Prisma.sql`l.source=${s}`)," OR ")})`);
 if(groups!=="all")clauses.push(Prisma.sql`l."groupName" IN (${Prisma.join(groups)})`);
 if(preferUnoffered)clauses.push(Prisma.sql`NOT ${brandId}=ANY(l."offeredEntityIds")`);
 const field=channel==="email"?Prisma.sql`l.email`:Prisma.sql`l.phone`;
 const identity=channel==="email"?Prisma.sql`lead_email_key(l.email)`:Prisma.sql`lead_phone_key(l.phone)`;
 const otherIdentity=channel==="email"?Prisma.sql`lead_email_key(b.email)`:Prisma.sql`lead_phone_key(b.phone)`;
 clauses.push(Prisma.sql`NULLIF(btrim(${field}),'') IS NOT NULL`);
 if(preferVerified)clauses.push(channel==="email"?Prisma.sql`l."emailStatus"='valid'`:Prisma.sql`l."phoneStatus"='valid'`);
 clauses.push(Prisma.sql`NOT EXISTS(SELECT 1 FROM "Lead" b WHERE ${otherIdentity}=${identity} AND (b."optedOut" OR b.status IN ('opted_out','converted') OR b."convertedEntityId" IS NOT NULL))`);
 const optIdentity=channel==="email"?Prisma.sql`lead_email_key(o.contact)`:Prisma.sql`lead_phone_key(o.contact)`;
 clauses.push(Prisma.sql`NOT EXISTS(SELECT 1 FROM "OptOut" o WHERE ${optIdentity}=${identity})`);
 if(channel==="email"){
   // Exact local format rules, not an external delivery/ownership verification.
   clauses.push(Prisma.sql`lower(btrim(l.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'`);
   const domain=Prisma.sql`split_part(lower(btrim(l.email)),'@',2)`;
   clauses.push(Prisma.sql`${domain} NOT IN ('mailinator.com','guerrillamail.com','tempmail.com','10minutemail.com','yopmail.com','trashmail.com','sharklasers.com')`);
   if(preferVerified)clauses.push(Prisma.sql`${domain} NOT LIKE '%.test' AND ${domain} NOT LIKE '%example.%' AND lower(l.email) NOT LIKE '%+test%'`);
   const result=await db.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT count(DISTINCT ${identity}) FROM "Lead" l WHERE ${Prisma.join(clauses," AND ")}`);
   return NextResponse.json({count:Number(result[0].count)});
 }
 // Consent parsing remains shared with dispatch. Restrict SQL to records with a
 // consent record first, and scan bounded pages rather than loading the pool.
 clauses.push(Prisma.sql`l."smsConsents" <> '[]'::jsonb`);
 const identities=new Set<string>();let cursor="";
 while(true){
   const rows=await db.$queryRaw<Awaited<ReturnType<typeof db.lead.findMany>>>(Prisma.sql`SELECT l.* FROM "Lead" l WHERE ${Prisma.join(clauses," AND ")} AND l.id>${cursor} ORDER BY l.id LIMIT 1000`);
   for(const raw of rows){const lead=mapLead(raw);if(isLeadEligibleForEntity(lead,brandId,{channel,sourceFilter:source,groupFilter:group,preferUnoffered,preferVerified}))identities.add(audienceContactKey(lead,channel));}
   if(rows.length<1000)break;cursor=rows.at(-1)!.id;
 }
 return NextResponse.json({count:identities.size});
}
