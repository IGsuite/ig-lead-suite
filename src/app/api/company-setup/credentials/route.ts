import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { canAccessEntity, isAdminSession } from "@/lib/acl";
import { getPrisma } from "@/lib/db";
import { setupCatalog } from "@/lib/company-setup";
import { encryptAccountPassword, decryptAccountPassword } from "@/lib/account-vault";
const headers={"Cache-Control":"no-store, private","Pragma":"no-cache"};
const base={entityId:z.string().min(1).max(100),key:z.string().refine(k=>setupCatalog.some(c=>c.key===k))};
const input=z.discriminatedUnion("action",[
  z.object({...base,action:z.literal("save"),password:z.string().min(1).max(4096),revision:z.number().int().min(0)}).strict(),
  z.object({...base,action:z.literal("reveal")}).strict(),
]);
export async function POST(request:Request){
  const denied=await requireApiSession({allowSetup:true});if(denied)return denied;
  if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Origin not allowed"},{status:403,headers});
  const session=await getSession(),admin=isAdminSession(session);
  if(!admin&&session?.role!=="setup")return NextResponse.json({error:"Account setup access required"},{status:403,headers});
  const raw=await request.text();if(Buffer.byteLength(raw)>10000)return NextResponse.json({error:"Entry too large"},{status:413,headers});
  let body;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid password request"},{status:400,headers});}
  const parsed=input.safeParse(body);if(!parsed.success)return NextResponse.json({error:"Check the password request fields"},{status:400,headers});
  const data=parsed.data;
  if(!canAccessEntity(session,data.entityId)||data.action==="reveal"&&!admin)return NextResponse.json({error:"Only an administrator can reveal stored account passwords."},{status:403,headers});
  const db=getPrisma(),where={entityId_key:{entityId:data.entityId,key:data.key}},title=setupCatalog.find(c=>c.key===data.key)!.title;
  if(!await db.companySetupItem.findUnique({where,select:{id:true}}))return NextResponse.json({error:"Save this checklist item before adding a password."},{status:400,headers});
  try{
    if(data.action==="reveal"){
      const row=await db.companyAccountCredential.findUnique({where});
      if(!row)return NextResponse.json({error:"No account password is saved"},{status:404,headers});
      const password=decryptAccountPassword(row.encryptedValue,data.entityId,data.key);
      await db.companySetupEvent.create({data:{id:randomUUID(),entityId:data.entityId,itemKey:data.key,message:`${title}: stored password viewed by administrator ${session?.email||"Local admin"}.`}});
      return NextResponse.json({password},{headers});
    }
    const encryptedValue=encryptAccountPassword(data.password,data.entityId,data.key);
    const saved=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`setup:${data.entityId}:${data.key}`}))::text`;
      const old=await tx.companyAccountCredential.findUnique({where,select:{revision:true}});
      if((old?.revision||0)!==data.revision)return false;
      await tx.companyAccountCredential.upsert({where,create:{id:randomUUID(),entityId:data.entityId,key:data.key,encryptedValue,updatedBy:session?.email||"Local admin"},update:{encryptedValue,revision:{increment:1},updatedBy:session?.email||"Local admin"}});
      await tx.companySetupItem.updateMany({where:{entityId:data.entityId,key:data.key},data:{status:"ready_for_review",revision:{increment:1},updatedBy:session?.email||"Local admin"}});
      await tx.companySetupEvent.create({data:{id:randomUUID(),entityId:data.entityId,itemKey:data.key,message:`${title}: account password ${old?"replaced":"saved"} by ${session?.email||"Local admin"}; value is hidden.`}});
      return true;
    });
    return saved?NextResponse.json({saved:true},{headers}):NextResponse.json({error:"Someone else replaced this password. Refresh before saving."},{status:409,headers});
  }catch{return NextResponse.json({error:"Account password could not be saved or opened. Check vault configuration with the administrator."},{status:503,headers});}
}
