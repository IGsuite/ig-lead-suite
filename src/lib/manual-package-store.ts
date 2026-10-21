import {getPrisma,isNeonConfigured} from "@/lib/db";
import {isProductionDeploy} from "@/lib/auth";
import {manualPackageInput} from "@/lib/manual-packages";
import {planManualPackage} from "@/lib/manual-package-plan";
import {ensureSeeded} from "@/lib/neon-store-seed";
import {mapLead} from "@/lib/mappers";
import {asJson} from "@/lib/neon-store-shared";
import type {z} from "zod";
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
  const leads=await tx.lead.findMany(),optOuts=await tx.optOut.findMany({select:{contact:true}});
  const planned=planManualPackage(leads.map(mapLead),optOuts,raw);
  for(const change of planned.changes){const l=change.lead;
   if(change.created)await tx.lead.create({data:{id:l.id,firstName:l.firstName,lastName:l.lastName,businessName:l.businessName,email:l.email,phone:l.phone,source:l.source,groupName:l.groupName,purchaseDate:new Date(l.purchaseDate),costCents:0,offeredEntityIds:[],status:"available",emailStatus:l.emailStatus,phoneStatus:l.phoneStatus,verifyNotes:l.verifyNotes,verifiedAt:new Date(l.verifiedAt!),manualPackages:asJson(l.manualPackages)}});
   else await tx.lead.update({where:{id:l.id},data:{manualPackages:asJson(l.manualPackages)}});
  }
  return planned.result;
 },{timeout:30000});
}
