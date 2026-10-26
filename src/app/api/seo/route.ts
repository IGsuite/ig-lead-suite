import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { canAccessEntity, isAdminSession } from "@/lib/acl";
import { getPrisma } from "@/lib/db";
import { seoProjectInput, seoReportInput, seoTaskPatch } from "@/lib/seo";
import { recordSeoReport } from "@/lib/seo-store";
import { ahrefsApiConfigured, syncSeoProject } from "@/lib/seo-ahrefs";
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
  const denied=await requireApiSession();if(denied)return denied;
  const session=await getSession(),db=getPrisma();
  const companies=(await db.entity.findMany({select:{id:true,name:true,websiteUrl:true},orderBy:{name:"asc"}})).filter(c=>canAccessEntity(session,c.id));
  const entityId=new URL(request.url).searchParams.get("entityId");
  if(entityId&&!companies.some(c=>c.id===entityId))return NextResponse.json({error:"Company not accessible"},{status:403});
  const where={entityId:entityId||{in:companies.map(c=>c.id)}};
  const alerts=await db.seoAlert.findMany({where:{...where,acknowledgedAt:null},orderBy:{createdAt:"desc"},take:100});
  if(new URL(request.url).searchParams.get("summary")==="1")return NextResponse.json({alerts:alerts.map(a=>({id:a.id,entityId:a.entityId,message:a.message}))},{headers});
  if(!entityId)return NextResponse.json({companies,alerts,isAdmin:isAdminSession(session),apiConfigured:ahrefsApiConfigured(),project:null,reports:[],tasks:[]},{headers});
  const project=await db.seoProject.findUnique({where:{entityId}});
  const [reports,tasks]=await Promise.all([
    db.seoReport.findMany({where:{entityId},orderBy:{auditedAt:"desc"},take:24}),
    db.seoTask.findMany({where:{entityId,...(project?{providerProjectId:project.providerProjectId}:{})},orderBy:[{priority:"asc"},{title:"asc"}],take:1000}),
  ]);
  return NextResponse.json({companies,project,reports,tasks,alerts,isAdmin:isAdminSession(session),apiConfigured:ahrefsApiConfigured()},{headers});
}
export async function POST(request:Request){
  const denied=await requireApiSession();if(denied)return denied;
  if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Origin not allowed"},{status:403});
  const session=await getSession(),db=getPrisma();
  const raw=await request.text();if(Buffer.byteLength(raw)>500_000)return NextResponse.json({error:"Report is too large"},{status:413});
  let body;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid request"},{status:400});}
  try{
    if(body.action==="task"){
      const input=seoTaskPatch.parse(body.data),task=await db.seoTask.findUnique({where:{id:input.id}});
      if(!task||!canAccessEntity(session,task.entityId))return NextResponse.json({error:"Task not accessible"},{status:403});
      // Verification is reserved for a later complete provider report, not a checkbox.
      if(task.status==="verified_fixed"&&input.status)return NextResponse.json({error:"A later audit verified this task; recurrence will reopen it automatically."},{status:400});
      const {id,...data}=input;return NextResponse.json(await db.seoTask.update({where:{id},data}),{headers});
    }
    if(body.action==="acknowledge"){
      if(typeof body.id!=="string")throw Error("Choose an alert");
      const alert=await db.seoAlert.findUnique({where:{id:body.id}});
      if(!alert||!canAccessEntity(session,alert.entityId))return NextResponse.json({error:"Alert not accessible"},{status:403});
      await db.seoAlert.update({where:{id:alert.id},data:{acknowledgedAt:new Date()}});return NextResponse.json({ok:true},{headers});
    }
    if(!isAdminSession(session))return NextResponse.json({error:"Administrator access required"},{status:403});
    if(body.action==="project"){
      const input=seoProjectInput.parse(body.data),entity=await db.entity.findUnique({where:{id:input.entityId},select:{websiteUrl:true}});
      if(!entity)throw Error("Choose an existing company");
      if(new URL(input.website).hostname.replace(/^www\./,"")!==new URL(entity.websiteUrl).hostname.replace(/^www\./,""))throw Error("Use this company's website.");
      if(input.automaticSync&&!ahrefsApiConfigured())throw Error("Connect an eligible Ahrefs API account before enabling automatic reporting.");
      return NextResponse.json(await db.seoProject.upsert({where:{entityId:input.entityId},create:input,update:{...input,syncError:null}}),{headers});
    }
    if(body.action==="report"){
      const input=seoReportInput.parse(body.data);
      // Manually saved reports never close issues merely because a row is omitted.
      return NextResponse.json(await recordSeoReport({...input,complete:false},"manual_review"),{headers});
    }
    if(body.action==="sync"){
      if(typeof body.entityId!=="string")throw Error("Choose a company");
      return NextResponse.json(await syncSeoProject(body.entityId),{headers});
    }
    throw Error("Unknown action");
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not save SEO update"},{status:400});}
}
