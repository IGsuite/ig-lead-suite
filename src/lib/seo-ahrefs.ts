import { getPrisma } from "@/lib/db";
import { seoRecommendation, seoReportInput } from "@/lib/seo";
import { recordSeoReport } from "@/lib/seo-store";

export function ahrefsApiConfigured(){return Boolean(process.env.AHREFS_API_KEY?.trim());}
async function ahrefs(path:"projects"|"issues",params:Record<string,string>){
  const key=process.env.AHREFS_API_KEY?.trim();
  if(!key)throw Error("Automatic reporting is not connected. An eligible Ahrefs API plan and server credential are required; no subscription has been purchased.");
  const url=new URL(`https://api.ahrefs.com/v3/site-audit/${path}`);
  Object.entries({...params,output:"json"}).forEach(([k,v])=>url.searchParams.set(k,v));
  const response=await fetch(url,{headers:{Authorization:`Bearer ${key}`,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(response.status===401||response.status===403?"Ahrefs denied API access. Check the plan and server credential.":`Ahrefs reporting is unavailable (${response.status}). Try again later.`);
  return response.json();
}
type HealthScore={project_id:string;date:string;status:string;health_score:number;total:number;urls_with_errors:number;target_url:string};
type ApiIssue={issue_id:string;name:string;importance:string;crawled:number;missing:number|null};
/** Validate the company mapping and pin both calls to the same completed crawl. Never launches a crawl or edits the website. */
export async function syncSeoProject(entityId:string){
  const db=getPrisma(),project=await db.seoProject.findUnique({where:{entityId}});
  if(!project)throw Error("Save an Ahrefs project for this company first.");
  const raw=await ahrefs("projects",{project_id:project.providerProjectId});
  const score=(raw.healthscores as HealthScore[]|undefined)?.find(s=>String(s.project_id)===project.providerProjectId);
  if(!score||score.status!=="Completed"||!score.date)throw Error("Ahrefs has no completed audit for this project yet.");
  const expected=new URL(project.website).hostname.replace(/^www\./,"");
  const actual=new URL(/^https?:\/\//.test(score.target_url)?score.target_url:`https://${score.target_url}`).hostname.replace(/^www\./,"");
  if(actual!==expected)throw Error("The Ahrefs project belongs to a different website. Correct the company mapping.");
  const auditedAt=new Date(score.date.endsWith("Z")||/[+-]\d\d:\d\d$/.test(score.date)?score.date:score.date+"Z");
  if(!Number.isFinite(auditedAt.getTime()))throw Error("Ahrefs returned an invalid audit date.");
  const duplicate=await db.seoReport.findUnique({where:{entityId_providerProjectId_auditedAt:{entityId,providerProjectId:project.providerProjectId,auditedAt}}});
  if(duplicate){await db.seoProject.update({where:{entityId},data:{lastCheckedAt:new Date(),syncError:null}});return {duplicate:true};}
  // Ahrefs documents a fixed cost of 50 API units for this issues request.
  const issues=await ahrefs("issues",{project_id:project.providerProjectId,date:auditedAt.toISOString().replace(/\.\d{3}Z$/,"" )});
  if(!Array.isArray(issues.issues))throw Error("Ahrefs returned an incomplete issues response; existing tasks were preserved.");
  const report=seoReportInput.parse({entityId,providerProjectId:project.providerProjectId,auditedAt:auditedAt.toISOString(),healthScore:score.health_score,internalPages:score.total,errorUrls:score.urls_with_errors,complete:true,
    findings:(issues.issues as ApiIssue[]).filter(i=>i.crawled>0||i.missing===0).map(i=>({key:i.issue_id,title:i.name,priority:i.importance?.toLowerCase(),count:i.crawled,recommendation:seoRecommendation(i.name),urls:[]}))});
  const result=await recordSeoReport(report,"ahrefs_api");
  await db.seoProject.update({where:{entityId},data:{lastCheckedAt:new Date(),syncError:null}});
  return result;
}
