import {NextResponse} from "next/server";
import {requireApiSession} from "@/lib/api-auth";
import {manualPackageInput} from "@/lib/manual-packages";
import {saveManualPackage} from "@/lib/manual-package-store";

export async function POST(request:Request){
  const unauthorized=await requireApiSession();if(unauthorized)return unauthorized;
  if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Origin not allowed"},{status:403});
  if(Number(request.headers.get("content-length")||0)>100000)return NextResponse.json({error:"Limit is 100 contacts per save"},{status:413});
  const parsed=manualPackageInput.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"A package name and 1–100 contacts are required"},{status:400});
  try{return NextResponse.json(await saveManualPackage(parsed.data));}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Manual contacts could not save"},{status:400});}
}
