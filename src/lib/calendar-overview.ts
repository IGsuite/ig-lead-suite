import type { CalendarEntry } from "@/lib/marketing-calendar";
import type { Brand, MessageTemplate, SocialCampaign } from "@/lib/types";

export type MarketingKind = "email" | "sms" | "meta" | "tiktok";
export type MarketingPlanItem = {
  id:string; brandId:string; company:string; title:string; programs:string[];
  kind:MarketingKind; startDate:string; endDate:string; time:string;
  status:string; href:string; detail:string; planningOnly:boolean;
};
export const marketingKindLabel:Record<MarketingKind,string> = {email:"Email",sms:"Text",meta:"Meta social",tiktok:"TikTok social"};

/** Dates in the social store are calendar dates, not local instants. */
function dateOnly(value:string|null|undefined):string|null {
  const raw=value?.slice(0,10);
  if(!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed=new Date(raw+"T12:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===raw ? raw:null;
}

export function marketingPlanItems(brands:Pick<Brand,"id"|"shortName">[],entries:CalendarEntry[],socials:SocialCampaign[],templates:Pick<MessageTemplate,"id"|"programs">[]):MarketingPlanItem[] {
  const companies=new Map(brands.map(b=>[b.id,b.shortName]));
  const templatePrograms=new Map(templates.map(t=>[t.id,t.programs || []]));
  const campaignItems=entries.filter(e=>companies.has(e.brandId) && (e.channel==="email"||e.channel==="sms")).map(e=>({
    id:e.id,brandId:e.brandId,company:companies.get(e.brandId)!,title:e.snapshot.name,
    programs:e.snapshot.programs?.length?e.snapshot.programs:[e.product],kind:e.channel as "email"|"sms",
    startDate:e.date,endDate:e.date,time:`${e.startTime}–${e.endTime} ${e.timezone}`,
    status:e.status,href:`/campaigns/calendar?brandId=${encodeURIComponent(e.brandId)}&month=${e.date.slice(0,7)}`,
    detail:`${e.snapshot.volume} contacts · Sources: ${e.snapshot.sourceFilter === "__audience_not_selected__" ? "not selected" : e.snapshot.sourceFilter} · ${e.snapshot.subject || e.product}`,
    planningOnly:false,
  }));
  const socialItems:MarketingPlanItem[]=socials.flatMap(s=>{
    if(!companies.has(s.entityId))return [];
    const start=dateOnly(s.scheduleStart),end=dateOnly(s.scheduleEnd)||start;
    if(!start||!end||end<start)return [];
    return [{id:`social-${s.id}`,brandId:s.entityId,company:companies.get(s.entityId)!,title:s.name,
      programs:s.creativeTemplateId?templatePrograms.get(s.creativeTemplateId)||[]:[],kind:s.platform,
      startDate:start,endDate:end,time:"Date range plan",status:s.status,
      href:`/social?entity=${encodeURIComponent(s.entityId)}&platform=${s.platform}`,
      detail:s.objective || "Social campaign plan",planningOnly:true}];
  });
  return [...campaignItems,...socialItems].sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.time.localeCompare(b.time)||a.company.localeCompare(b.company)||a.title.localeCompare(b.title));
}

export function filterMarketingPlan(items:MarketingPlanItem[],filters:{month:string;brandId:string;kind:string;program:string}) {
  const monthEnd=filters.month+"-31";
  return items.filter(i=>i.startDate<=monthEnd && i.endDate>=filters.month+"-01" &&
    (filters.brandId==="all"||i.brandId===filters.brandId) &&
    (filters.kind==="all"||(filters.kind==="social"?i.planningOnly:i.kind===filters.kind)) &&
    (filters.program==="all"||i.programs.includes(filters.program)));
}
