import { z } from "zod";
import type { Campaign } from "@/lib/types";
export const draftFields = z.object({
  brandId:z.string().min(1), name:z.string().trim().min(1).max(200), programs:z.array(z.string()).max(40), channel:z.enum(["sms","email"]),
  subject:z.string().max(500).optional(), message:z.string().trim().min(1).max(300000), htmlMessage:z.string().max(300000).nullable().optional(),
  imageUrl:z.string().max(3000).nullable().optional(), imageAlt:z.string().max(500).nullable().optional(), sourceFilter:z.string().min(1).max(2000), groupFilter:z.string().min(1).max(2000),
  preferUnoffered:z.boolean(), preferVerified:z.boolean(), mode:z.enum(["own","auto"]), volume:z.number().int().min(1).max(20000), throttlePerHour:z.number().int().min(1).max(20000),
  sendWindowPreset:z.enum(["any","morning","afternoon","evening","custom"]),sendWindowStart:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),sendWindowEnd:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),timezone:z.string().refine(s=>{try{new Intl.DateTimeFormat("en",{timeZone:s});return true;}catch{return false;}}),
});
export async function draftFingerprint(c: Partial<Campaign>):Promise<string> {
  const fields=[c.brandId,c.name,c.programs||[],c.channel,c.subject??null,c.message,c.htmlMessage??null,c.imageUrl??null,c.imageAlt??null,c.sourceFilter,c.groupFilter,c.preferUnoffered,c.preferVerified,c.mode,c.volume,c.throttlePerHour,c.sendWindowPreset,c.sendWindowStart??null,c.sendWindowEnd??null,c.timezone];
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(fields)));
  return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
export function smsSegmentCount(text:string):number {
  if(!text)return 0;
  const gsm=/^[\x20-\x7e\n\r@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉÄÖÑÜ§¿äöñüà€]*$/;
  const units=gsm.test(text)?[...text].reduce((n,c)=>n+(/[\^{}\\\[\]~|€]/.test(c)?2:1),0):text.length;
  const basic=gsm.test(text);return units<=(basic?160:70)?1:Math.ceil(units/(basic?153:67));
}
export const approvedProgramArtwork:Record<string,string>={"HELOC":"heloc-business-v3.png","SBA 7(a)":"sba-7a-v1.png","SBA 504":"sba-504-v1.png","SBA Express":"sba-express-v1.png","Business Line of Credit":"business-line-of-credit-v1.png","Revenue-Based Financing / MCA":"revenue-based-financing-v1.png","Term Loans":"term-loans-v1.png","Equipment Financing":"equipment-financing-v1.png","Invoice Factoring":"invoice-factoring-v1.png","Small Business Loans":"small-business-loans-v1.png"};
