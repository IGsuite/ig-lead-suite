import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { isAdminSession } from "@/lib/acl";
import { getPrisma } from "@/lib/db";
import { subscriptionInput } from "@/lib/subscriptions";

async function authorize() {
  const denied=await requireApiSession();if(denied)return denied;
  if(!isAdminSession(await getSession()))return NextResponse.json({error:"Subscriptions are available to administrators only."},{status:403});
}
const headers={"Cache-Control":"no-store"};
export async function GET(){
  const denied=await authorize();if(denied)return denied;
  const db=getPrisma();const [subscriptions,companies]=await Promise.all([
    db.serviceSubscription.findMany({orderBy:{service:"asc"}}),db.entity.findMany({select:{id:true,name:true},orderBy:{name:"asc"}}),
  ]);
  return NextResponse.json({subscriptions,companies},{headers});
}
export async function POST(request:Request){
  const denied=await authorize();if(denied)return denied;
  if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Origin not allowed"},{status:403});
  const raw=await request.text();if(Buffer.byteLength(raw)>16000)return NextResponse.json({error:"Entry is too large"},{status:413});
  let json;try{json=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid entry"},{status:400});}
  const parsed=subscriptionInput.safeParse(json);if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||"Check the subscription fields"},{status:400});
  const db=getPrisma(),{id,...data}=parsed.data;
  const count=await db.entity.count({where:{id:{in:data.companyIds}}});if(count!==data.companyIds.length)return NextResponse.json({error:"Choose existing companies"},{status:400});
  if(id&&!await db.serviceSubscription.findUnique({where:{id},select:{id:true}}))return NextResponse.json({error:"Subscription not found"},{status:404});
  const row=id?await db.serviceSubscription.update({where:{id},data}):await db.serviceSubscription.create({data:{id:randomUUID(),...data}});
  return NextResponse.json(row,{status:id?200:201,headers});
}
