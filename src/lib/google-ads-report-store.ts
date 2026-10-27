import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/db";
import { decryptAccountPassword, encryptAccountPassword } from "@/lib/account-vault";
import { GOOGLE_REPORT_KEY, googleReportConfigSchema, type GoogleReportConfig } from "@/lib/google-ads-reporting";
export async function readGoogleReportConfig() {
  const row=await getPrisma().companyAccountCredential.findUnique({where:{entityId_key:{entityId:"abstract",key:GOOGLE_REPORT_KEY}}});
  return {row,config:row?googleReportConfigSchema.parse(JSON.parse(decryptAccountPassword(row.encryptedValue,"abstract",GOOGLE_REPORT_KEY))):null};
}
export async function changeGoogleReportConfig(change:(config:GoogleReportConfig|null,revision:number)=>GoogleReportConfig,actor:string,message?:string) {
  return getPrisma().$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"google-report:abstract"}))::text`;
    const where={entityId_key:{entityId:"abstract",key:GOOGLE_REPORT_KEY}};
    const old=await tx.companyAccountCredential.findUnique({where});
    const config=old?googleReportConfigSchema.parse(JSON.parse(decryptAccountPassword(old.encryptedValue,"abstract",GOOGLE_REPORT_KEY))):null;
    const next=googleReportConfigSchema.parse(change(config,old?.revision??0));
    const encryptedValue=encryptAccountPassword(JSON.stringify(next),"abstract",GOOGLE_REPORT_KEY);
    const saved=await tx.companyAccountCredential.upsert({where,create:{id:randomUUID(),entityId:"abstract",key:GOOGLE_REPORT_KEY,encryptedValue,updatedBy:actor},update:{encryptedValue,revision:{increment:1},updatedBy:actor}});
    if(message)await tx.companySetupEvent.create({data:{id:randomUUID(),entityId:"abstract",itemKey:"google_ads",message}});
    return {config:next,revision:saved.revision};
  });
}
