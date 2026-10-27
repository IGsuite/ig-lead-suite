import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-auth";
import { getSession } from "@/lib/auth";
import { canAccessEntity,isAdminSession } from "@/lib/acl";
import { accountVaultConfigured } from "@/lib/account-vault";
import { googleAdsReportScript,newGoogleReportAccess,publicGoogleReport } from "@/lib/google-ads-reporting";
import { readGoogleReportConfig,changeGoogleReportConfig } from "@/lib/google-ads-report-store";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store, private",Pragma:"no-cache"};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers});
export async function GET(request:Request) {
  const denied=await requireApiSession();if(denied)return denied;
  const session=await getSession();
  if(new URL(request.url).searchParams.get("entityId")!=="abstract"||!canAccessEntity(session,"abstract"))return json({error:"Choose Abstract Capital Group."},403);
  try{const {row,config}=await readGoogleReportConfig();return json({...publicGoogleReport(config,row?.revision??0),isAdmin:isAdminSession(session),vaultConfigured:accountVaultConfigured()});}
  catch{return json({error:"Protected report storage could not be opened."},503);}
}
const input=z.object({entityId:z.literal("abstract"),action:z.enum(["create","revoke"]),revision:z.number().int().min(0),approvedScope:z.literal("google_ads_reports_only")}).strict();
export async function POST(request:Request) {
  const denied=await requireApiSession();if(denied)return denied;
  const session=await getSession();if(!isAdminSession(session)||request.headers.get("origin")!==new URL(request.url).origin)return json({error:"Owner access on this website required."},403);
  const raw=await request.text();if(Buffer.byteLength(raw)>2000)return json({error:"Request too large."},413);
  let body;try{body=input.parse(JSON.parse(raw));}catch{return json({error:"Review the report access permission."},400);}
  try{
    const access=newGoogleReportAccess();
    const saved=await changeGoogleReportConfig((config,revision)=>{
      if(revision!==body.revision)throw Error("changed");
      if(body.action==="revoke"){if(!config)throw Error("missing");return {...config,revoked:true};}
      return {...access.config,report:config?.report??null};
    },session?.email||"Local owner",`Google Ads report access ${body.action==="create"?"created/replaced for 90 days":"revoked"}. This key accepts Abstract campaign reports only and cannot read leads or change ads.`);
    return json({...publicGoogleReport(saved.config,saved.revision),...(body.action==="create"?{script:googleAdsReportScript(access.token)}:{})});
  }catch{return json({error:"Report access could not save. Refresh the page and check protected storage."},409);}
}
