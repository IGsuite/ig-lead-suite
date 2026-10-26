import { timingSafeEqual } from "node:crypto";
export function seoIntegrationScope(request:Request):string[]|null {
  const token=process.env.COMMAND_CENTER_SEO_TOKEN?.trim();
  const entities=(process.env.COMMAND_CENTER_SEO_ENTITIES||"").split(",").map(s=>s.trim()).filter(Boolean);
  if(!token||token.length<32||!entities.length)return null;
  const actual=Buffer.from(request.headers.get("authorization")||""),expected=Buffer.from(`Bearer ${token}`);
  return actual.length===expected.length&&timingSafeEqual(actual,expected)?entities:null;
}
export function seoEventCursor(value:string|null):{at:Date;id:string}|null {
  if(!value)return null;
  try{const parsed=JSON.parse(Buffer.from(value,"base64url").toString());
    if(typeof parsed.id!=="string"||!/^[-a-z0-9]{1,100}$/i.test(parsed.id)||typeof parsed.at!=="string"||!Number.isFinite(Date.parse(parsed.at)))throw Error();
    return {at:new Date(parsed.at),id:parsed.id};
  }catch{throw Error("Invalid event cursor");}
}
