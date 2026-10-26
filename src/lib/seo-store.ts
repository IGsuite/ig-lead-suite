import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/db";
import { isNewerAudit, nextSeoTaskStatus, type SeoReportInput } from "@/lib/seo";

export async function recordSeoReport(input:SeoReportInput, source:"manual_review"|"ahrefs_api") {
  const db=getPrisma();
  return db.$transaction(async tx=>{
    // Serialize imports for this company so two overlapping syncs cannot reopen or close stale issues.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`seo:${input.entityId}`}))::text`;
    const project=await tx.seoProject.findUnique({where:{entityId:input.entityId}});
    if(!project||project.providerProjectId!==input.providerProjectId)throw Error("Save this company's matching Ahrefs project first.");
    const auditedAt=new Date(input.auditedAt);
    const duplicate=await tx.seoReport.findUnique({where:{entityId_providerProjectId_auditedAt:{entityId:input.entityId,providerProjectId:input.providerProjectId,auditedAt}}});
    if(duplicate)return {report:duplicate,duplicate:true};
    const latest=await tx.seoReport.findFirst({where:{entityId:input.entityId,providerProjectId:input.providerProjectId},orderBy:{auditedAt:"desc"}});
    const complete=source==="ahrefs_api"&&input.complete;
    const report=await tx.seoReport.create({data:{...input,auditedAt,complete,source,id:randomUUID()}});
    if(!isNewerAudit(auditedAt,latest?.auditedAt))return {report,duplicate:false};
    const existing=await tx.seoTask.findMany({where:{entityId:input.entityId,providerProjectId:input.providerProjectId}});
    let newlyOpen=0;
    for(const finding of input.findings.filter(f=>f.count>0)){
      const previous=existing.find(t=>t.issueKey===finding.key);
      if(!previous||previous.status==="verified_fixed")newlyOpen++;
      const data={title:finding.title,priority:finding.priority,affectedCount:finding.count,recommendation:finding.recommendation,urls:finding.urls,lastSeenAt:auditedAt,verifiedAt:null,status:nextSeoTaskStatus(previous?.status,true,complete)};
      await tx.seoTask.upsert({where:{entityId_providerProjectId_issueKey:{entityId:input.entityId,providerProjectId:input.providerProjectId,issueKey:finding.key}},
        create:{...data,id:randomUUID(),entityId:input.entityId,providerProjectId:input.providerProjectId,issueKey:finding.key,firstSeenAt:auditedAt},update:data});
    }
    if(complete){
      // Omitted rows or missing pages are not proof of repair. Require an explicit zero-count provider row.
      const clearedKeys=input.findings.filter(f=>f.count===0).map(f=>f.key);
      await tx.seoTask.updateMany({where:{entityId:input.entityId,providerProjectId:input.providerProjectId,issueKey:{in:clearedKeys},status:{not:"verified_fixed"}},data:{status:"verified_fixed",verifiedAt:auditedAt}});
    }
    const dropped=latest&&input.healthScore<latest.healthScore;
    await tx.seoAlert.create({data:{id:randomUUID(),entityId:input.entityId,reportId:report.id,
      message:`New SEO report: ${input.healthScore}/100, ${input.errorUrls} internal URLs with errors. ${newlyOpen} new or recurring findings.${dropped?` Score decreased from ${latest.healthScore}.`:""}`}});
    return {report,duplicate:false};
  },{timeout:20000});
}
