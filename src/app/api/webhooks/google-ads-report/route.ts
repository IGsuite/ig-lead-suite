import { NextResponse } from "next/server";
import { googleReportSchema,validGoogleReportAccess,validateGoogleReportTime } from "@/lib/google-ads-reporting";
import { changeGoogleReportConfig } from "@/lib/google-ads-report-store";
export const runtime="nodejs";
export async function POST(request:Request) {
  const raw=await request.text();if(Buffer.byteLength(raw)>100_000)return NextResponse.json({error:"Too large"},{status:413});
  let report;try{report=googleReportSchema.parse(JSON.parse(raw));if(!validateGoogleReportTime(report))throw Error();}catch{return NextResponse.json({error:"Invalid report"},{status:400});}
  try{
    await changeGoogleReportConfig((config)=>{
      if(!config||!validGoogleReportAccess(request.headers.get("authorization"),config))throw Error("denied");
      if(config.receivedAt&&Date.now()-Date.parse(config.receivedAt)<60_000)throw Error("rate");
      if(config.report&&Date.parse(report.collectedAt)<=Date.parse(config.report.collectedAt))throw Error("old");
      return {...config,report,receivedAt:new Date().toISOString()};
    },"Google Ads report bridge");
    return NextResponse.json({accepted:true},{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"Report not accepted. Check access, expiry and last report time."},{status:403});}
}
