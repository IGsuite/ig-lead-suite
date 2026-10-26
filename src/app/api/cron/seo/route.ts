import { timingSafeEqual, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { ahrefsApiConfigured, syncSeoProject } from "@/lib/seo-ahrefs";
export const maxDuration=300;
export async function GET(request:Request){
  const secret=process.env.CRON_SECRET?.trim();
  if(!secret||secret.length<32)return NextResponse.json({error:"Scheduler not configured"},{status:503});
  const actual=Buffer.from(request.headers.get("authorization")||""),expected=Buffer.from(`Bearer ${secret}`);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!ahrefsApiConfigured())return NextResponse.json({status:"not_connected",checked:0});
  const db=getPrisma(),projects=await db.seoProject.findMany({where:{automaticSync:true},take:20});
  let checked=0,failed=0;
  for(const project of projects){
    try{await syncSeoProject(project.entityId);checked++;}
    catch(error){
      failed++;const message=error instanceof Error?error.message:"SEO sync failed";
      await db.$transaction(async tx=>{
        const latest=await tx.seoProject.findUnique({where:{entityId:project.entityId}});
        await tx.seoProject.update({where:{entityId:project.entityId},data:{lastCheckedAt:new Date(),syncError:message}});
        if(latest?.syncError!==message)await tx.seoAlert.create({data:{id:randomUUID(),entityId:project.entityId,message:`SEO connection needs attention: ${message}`}});
      });
    }
  }
  return NextResponse.json({checked,failed});
}
