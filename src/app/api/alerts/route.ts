import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { canAccessEntity } from "@/lib/acl";
import { getPrisma } from "@/lib/db";
import { activeSetupKeys } from "@/lib/company-setup";
const headers={"Cache-Control":"no-store"};
export async function GET(){
  const denied=await requireApiSession({allowSetup:true});if(denied)return denied;
  const session=await getSession(),db=getPrisma();
  const companies=(await db.entity.findMany({select:{id:true,name:true}})).filter(c=>canAccessEntity(session,c.id));
  const where={entityId:{in:companies.map(c=>c.id)}};
  const [seo,setup,needsOwner]=await Promise.all([
    db.seoAlert.findMany({where:{...where,acknowledgedAt:null},orderBy:{createdAt:"desc"},take:100}),
    db.companySetupEvent.findMany({where:{...where,itemKey:{in:activeSetupKeys},acknowledgedAt:null},orderBy:{createdAt:"desc"},take:100}),
    db.companySetupItem.count({where:{...where,key:{in:activeSetupKeys},status:"needs_owner"}}),
  ]);
  const items=[...seo.map(a=>({...a,kind:"seo",href:session?.role==="setup"?`/company-setup?entity=${encodeURIComponent(a.entityId)}`:`/social?entity=${encodeURIComponent(a.entityId)}&platform=seo`})),
    ...setup.map(a=>({...a,kind:"setup",href:`/company-setup?entity=${encodeURIComponent(a.entityId)}#${a.itemKey}`}))].sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
  return NextResponse.json({companies,items,needsOwner},{headers});
}
export async function POST(request:Request){
  const denied=await requireApiSession({allowSetup:true});if(denied)return denied;
  if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Origin not allowed"},{status:403});
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.id!=="string"||!["seo","setup"].includes(body.kind))return NextResponse.json({error:"Choose an alert"},{status:400});
  const db=getPrisma(),session=await getSession();
  const row=body.kind==="seo"?await db.seoAlert.findUnique({where:{id:body.id}}):await db.companySetupEvent.findUnique({where:{id:body.id}});
  if(!row||!canAccessEntity(session,row.entityId))return NextResponse.json({error:"Alert not accessible"},{status:403});
  if(body.kind==="seo")await db.seoAlert.update({where:{id:row.id},data:{acknowledgedAt:new Date()}});
  else await db.companySetupEvent.update({where:{id:row.id},data:{acknowledgedAt:new Date()}});
  return NextResponse.json({ok:true},{headers});
}
