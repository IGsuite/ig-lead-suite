import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { canAccessEntity, isAdminSession } from "@/lib/acl";
import { getPrisma } from "@/lib/db";
import { setupCatalog, setupItemInput, setupCanVerify, setupStatuses } from "@/lib/company-setup";
import { z } from "zod";
import { accountVaultConfigured } from "@/lib/account-vault";
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
  const denied=await requireApiSession({allowSetup:true});if(denied)return denied;
  const session=await getSession(),db=getPrisma();
  const companies=(await db.entity.findMany({select:{id:true,name:true,websiteUrl:true,socialLinks:true},orderBy:{name:"asc"}})).filter(c=>canAccessEntity(session,c.id));
  const entityId=new URL(request.url).searchParams.get("entityId");
  if(entityId&&!companies.some(c=>c.id===entityId))return NextResponse.json({error:"Company not accessible"},{status:403});
  const scope={entityId:entityId||{in:companies.map(c=>c.id)}};
  const [metadata,credentials]=await Promise.all([db.companySetupItem.findMany({where:scope,orderBy:{key:"asc"}}),db.companyAccountCredential.findMany({where:scope,select:{entityId:true,key:true,revision:true}})]);
  const items=metadata.map(item=>({...item,hasPassword:credentials.some(c=>c.entityId===item.entityId&&c.key===item.key),credentialRevision:credentials.find(c=>c.entityId===item.entityId&&c.key===item.key)?.revision||0}));
  const history=entityId?await db.companySetupEvent.findMany({where:{entityId},orderBy:{createdAt:"desc"},take:25}):[];
  return NextResponse.json({companies,items,history,catalog:setupCatalog,isAdmin:isAdminSession(session),vaultConfigured:accountVaultConfigured()},{headers});
}
const updateInput=z.object({data:setupItemInput,revision:z.number().int().min(0)}).strict();
export async function POST(request:Request){
  const denied=await requireApiSession({allowSetup:true});if(denied)return denied;
  if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Origin not allowed"},{status:403});
  const raw=await request.text();if(Buffer.byteLength(raw)>16000)return NextResponse.json({error:"Entry too large"},{status:413});
  let json;try{json=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid entry"},{status:400});}
  const parsed=updateInput.safeParse(json);if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||"Check the fields"},{status:400});
  const session=await getSession(),{data,revision}=parsed.data;
  if(!canAccessEntity(session,data.entityId))return NextResponse.json({error:"Company not accessible"},{status:403});
  if(!setupCanVerify(isAdminSession(session)?"admin":session?.role,data.status))return NextResponse.json({error:"The owner must test or mark an item not needed. Use Ready for review instead."},{status:403});
  const db=getPrisma();if(!await db.entity.findUnique({where:{id:data.entityId},select:{id:true}}))return NextResponse.json({error:"Company not found"},{status:404});
  const result=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`setup:${data.entityId}:${data.key}`}))::text`;
    const previous=await tx.companySetupItem.findUnique({where:{entityId_key:{entityId:data.entityId,key:data.key}}});
    if((previous?.revision||0)!==revision)return null;
    // Setup assistants cannot silently alter owner-verified account details.
    const status=!isAdminSession(session)&&previous?.status==="tested"?"ready_for_review":data.status;
    const row=await tx.companySetupItem.upsert({where:{entityId_key:{entityId:data.entityId,key:data.key}},
      create:{...data,status,id:randomUUID(),updatedBy:session?.email||"Local admin"},
      update:{...data,status,revision:{increment:1},updatedBy:session?.email||"Local admin"}});
    const title=setupCatalog.find(c=>c.key===data.key)!.title;
    await tx.companySetupEvent.create({data:{id:randomUUID(),entityId:data.entityId,itemKey:data.key,message:`${title}: ${setupStatuses[status]} — updated by ${session?.email||"Local admin"}.`}});
    return row;
  });
  if(!result)return NextResponse.json({error:"Someone else updated this item. Refresh before saving so their changes are preserved."},{status:409});
  return NextResponse.json(result,{headers});
}
