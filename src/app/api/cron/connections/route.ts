import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { monitorConnections } from "@/lib/connection-monitor";
import { getPrisma } from "@/lib/db";
export const runtime="nodejs";
export const maxDuration=300;
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET?.trim();
  if(!secret || secret.length<32)return NextResponse.json({error:"Scheduler not configured"},{status:503});
  const actual=Buffer.from(request.headers.get("authorization")||""),expected=Buffer.from(`Bearer ${secret}`);
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected))return NextResponse.json({error:"Unauthorized"},{status:401});
  // Shared database lease bounds overlapping scheduler retries without holding a transaction during provider calls.
  const db=getPrisma(),owner=crypto.randomUUID();
  const acquired=await db.$queryRaw<Array<{owner:string}>>`INSERT INTO "WorkerLease" (id, owner, "expiresAt") VALUES ('connection-monitor', ${owner}, NOW()+interval '6 minutes') ON CONFLICT (id) DO UPDATE SET owner=EXCLUDED.owner, "expiresAt"=EXCLUDED."expiresAt" WHERE "WorkerLease"."expiresAt"<NOW() RETURNING owner`;
  if(!acquired.length)return NextResponse.json({status:"already_running"});
  try{return NextResponse.json(await monitorConnections(),{headers:{"Cache-Control":"no-store"}});}
  catch{return NextResponse.json({error:"Connection monitoring could not complete. Check the scheduler and database; no messages were sent."},{status:503});}
  finally{await db.workerLease.deleteMany({where:{id:"connection-monitor",owner}});}
}
