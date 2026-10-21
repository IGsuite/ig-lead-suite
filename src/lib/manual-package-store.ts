import {getPrisma,isNeonConfigured} from "@/lib/db";
import {isProductionDeploy} from "@/lib/auth";
import {manualPackageInput} from "@/lib/manual-packages";
import {planManualPackage} from "@/lib/manual-package-plan";
import {ensureSeeded} from "@/lib/neon-store-seed";
import {mapLead} from "@/lib/mappers";
import {asJson} from "@/lib/neon-store-shared";
import type {z} from "zod";
import {Prisma} from "@/generated/prisma/client";
import {emailKey,phoneKey} from "@/lib/bulk-csv";
/** Atomic membership updates never reset a contact's original source, consent or history. */
export async function saveManualPackage(raw:z.infer<typeof manualPackageInput>){
 if(!isNeonConfigured()){
  if(isProductionDeploy())throw new Error("DATABASE_URL is required in production");
  const {ensureStore,writeStore}=await import("@/lib/json-store-io");
  const data=await ensureStore(),planned=planManualPackage(data.leads,data.optOuts,raw);
  data.leads=planned.leads;await writeStore(data);return planned.result;
 }
 await ensureSeeded();const db=getPrisma();
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('ig-send-enqueue'))::text`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(720261021::bigint)::text`;
  const emails=raw.rows.map(r=>emailKey(r.email)).filter(Boolean),phones=raw.rows.map(r=>phoneKey(r.phone)).filter(Boolean);
  const leads=await tx.$queryRaw<Awaited<ReturnType<typeof tx.lead.findMany>>>(Prisma.sql`SELECT * FROM "Lead" WHERE lead_email_key(email) IN (${Prisma.join(emails.length?emails:[""])}) OR lead_phone_key(phone) IN (${Prisma.join(phones.length?phones:[""])})`);
  const named=await tx.lead.findFirst({where:{manualPackages:{array_contains:[{id:raw.id}]}},orderBy:{id:"asc"}});
  if(named&&!leads.some(l=>l.id===named.id))leads.push(named);
  const optOuts=await tx.$queryRaw<{contact:string}[]>(Prisma.sql`SELECT contact FROM "OptOut" WHERE lead_email_key(contact) IN (${Prisma.join(emails.length?emails:[""])}) OR lead_phone_key(contact) IN (${Prisma.join(phones.length?phones:[""])})`);
  const planned=planManualPackage(leads.map(mapLead),optOuts,raw);
  for(const change of planned.changes){const l=change.lead;
   if(change.created)await tx.lead.create({data:{id:l.id,firstName:l.firstName,lastName:l.lastName,businessName:l.businessName,email:l.email,phone:l.phone,source:l.source,groupName:l.groupName,purchaseDate:new Date(l.purchaseDate),costCents:0,offeredEntityIds:[],status:"available",emailStatus:l.emailStatus,phoneStatus:l.phoneStatus,verifyNotes:l.verifyNotes,verifiedAt:new Date(l.verifiedAt!),manualPackages:asJson(l.manualPackages)}});
   else await tx.lead.update({where:{id:l.id},data:{manualPackages:asJson(l.manualPackages)}});
  }
  return {...planned.result,total:await tx.lead.count({where:{manualPackages:{array_contains:[{id:raw.id}]}}})};
 },{timeout:30000});
}
