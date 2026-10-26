import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { ahrefsReportUrl } from "@/lib/seo";
import { seoEventCursor, seoIntegrationScope } from "@/lib/seo-integration";
/** Read-only, company-scoped handoff for IGF Ventures. Disabled until explicitly configured. */
export async function GET(request:Request){
  const entities=seoIntegrationScope(request);
  if(!entities)return NextResponse.json({error:"Integration is not connected or credential is invalid"},{status:401});
  let cursor;try{cursor=seoEventCursor(new URL(request.url).searchParams.get("after"));}catch{return NextResponse.json({error:"Invalid event cursor"},{status:400});}
  const events=await getPrisma().seoAlert.findMany({where:{entityId:{in:entities},...(cursor?{OR:[{createdAt:{gt:cursor.at}},{createdAt:cursor.at,id:{gt:cursor.id}}]}:{})},orderBy:[{createdAt:"asc"},{id:"asc"}],take:100,include:{report:true}});
  const last=events.at(-1);
  return NextResponse.json({events:events.map(event=>({id:event.id,type:"seo.audit_update",companyId:event.entityId,createdAt:event.createdAt,message:event.message,
    crmUrl:`https://www.igleadsuite.com/social?entity=${encodeURIComponent(event.entityId)}&platform=seo`,
    report:event.report?{auditedAt:event.report.auditedAt,source:event.report.source,healthScore:event.report.healthScore,internalPages:event.report.internalPages,errorUrls:event.report.errorUrls,findings:event.report.findings,providerUrl:ahrefsReportUrl(event.report.providerProjectId)}:null})),
    nextCursor:last?Buffer.from(JSON.stringify({at:last.createdAt.toISOString(),id:last.id})).toString("base64url"):new URL(request.url).searchParams.get("after"),hasMore:events.length===100},
    {headers:{"Cache-Control":"no-store"}});
}
