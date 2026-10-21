import { z } from "zod";
import { parseAudienceFilter, matchesAudienceFilter } from "@/lib/audience-filters";
import type { Lead } from "@/lib/types";

export type ManualPackage={id:string;name:string};
export const manualPackageInput=z.object({id:z.uuid(),name:z.string().trim().min(1).max(80),rows:z.array(z.object({
  firstName:z.string().trim().max(100).optional(),lastName:z.string().trim().max(100).optional(),businessName:z.string().trim().max(200).optional(),email:z.string().trim().max(254).optional(),phone:z.string().trim().max(40).optional(),
})).min(1).max(100)});
export function readManualPackages(raw:unknown):ManualPackage[]{
  if(!Array.isArray(raw))return [];
  return raw.flatMap(p=>p&&typeof p==="object"&&typeof p.id==="string"&&typeof p.name==="string"?[{id:p.id,name:p.name}]:[]);
}
export function manualPackageSource(id:string){return `manual-package:${id}`;}
export function listManualPackages(leads:Pick<Lead,"manualPackages">[]){
  const packages=new Map<string,ManualPackage&{count:number}>();
  for(const lead of leads)for(const p of readManualPackages(lead.manualPackages)){
    const existing=packages.get(p.id);packages.set(p.id,{...p,count:(existing?.count||0)+1});
  }
  return [...packages.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
export function leadSourceOptions(leads:Pick<Lead,"source"|"manualPackages">[]):string[]{
  return [...new Set(leads.map(l=>l.source))].sort().concat(listManualPackages(leads).map(p=>manualPackageSource(p.id)));
}
export function leadSourceLabel(value:string,leads:Pick<Lead,"manualPackages">[]):string{
  if(value==="all")return "All sources";
  if(value==="__audience_not_selected__")return "Not selected";
  const parsed=parseAudienceFilter(value);
  if(parsed==="all")return "All sources";
  const packages=listManualPackages(leads);
  return parsed.map(s=>s.startsWith("manual-package:")?`Manual package — ${packages.find(p=>manualPackageSource(p.id)===s)?.name||s.slice(-8)}`:s==="Manual"?"Manual — all contacts":s).join(" + ");
}
export function matchesLeadSource(lead:Pick<Lead,"source"|"manualPackages">,filter:string|null|undefined){
  if(filter==="__audience_not_selected__")return false;
  const parsed=parseAudienceFilter(filter);if(parsed==="all")return true;
  return parsed.some(s=>s.startsWith("manual-package:")?readManualPackages(lead.manualPackages).some(p=>manualPackageSource(p.id)===s):matchesAudienceFilter(lead.source,s));
}
