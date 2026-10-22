"use client";
import { platformAudienceCatalog } from "@/lib/manual-packages";


import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlatform } from "@/hooks/use-platform";
import type { CalendarEntry } from "@/lib/marketing-calendar";
import { filterMarketingPlan, marketingKindLabel, marketingPlanItems } from "@/lib/calendar-overview";
import { cn } from "@/lib/utils";

const field="w-full rounded-md border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2 text-sm";
const weekdays=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const kindStyle={email:"border-l-emerald-600",sms:"border-l-blue-500",meta:"border-l-violet-500",tiktok:"border-l-rose-500",google_ads:"border-l-amber-500",seo:"border-l-teal-500"};
type MonthPlan={month:string;entries:CalendarEntry[];enabled:boolean};

function CalendarOverviewInner(){
  const {data,loading,error,refresh}=usePlatform();
  const params=useSearchParams();
  const [brandId,setBrandId]=useState(params.get("brandId")||"all");
  const [month,setMonth]=useState(()=>/^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("month")||"") ? params.get("month")! : new Date().toLocaleDateString("en-CA",{timeZone:"America/New_York"}).slice(0,7));
  const [kind,setKind]=useState("all");
  const [program,setProgram]=useState("all");
  const [plan,setPlan]=useState<MonthPlan|null>(null);
  const [planError,setPlanError]=useState("");
  const [selectedDate,setSelectedDate]=useState("");
  const load=useCallback(async(signal?:AbortSignal)=>{
    try{
      const response=await fetch(`/api/marketing-calendar?brandId=all&month=${month}`,{signal});
      const json=await response.json();if(!response.ok)throw new Error(json.error||"Calendar could not load");
      if(!signal?.aborted){setPlan({month,entries:json.entries,enabled:json.enabled});setPlanError("");}
    }catch(e){if(!signal?.aborted)setPlanError(e instanceof Error?e.message:"Calendar could not load");}
  },[month]);
  useEffect(()=>{const controller=new AbortController();void Promise.resolve().then(()=>load(controller.signal));return ()=>controller.abort();},[load]);
  function chooseMonth(value:string){if(/^\d{4}-(0[1-9]|1[0-2])$/.test(value)){setMonth(value);setSelectedDate("");setPlanError("");}}
  function moveMonth(delta:number){const d=new Date(month+"-01T12:00:00Z");d.setUTCMonth(d.getUTCMonth()+delta);chooseMonth(d.toISOString().slice(0,7));}
  if(loading)return <LoadingPanel/>;
  if(error||!data)return <ErrorPanel message={error||"Workspace unavailable"} onRetry={refresh}/>;
  const visibleBrands=brandId==="all"?data.brands:data.brands.filter(b=>b.id===brandId);
  const programs=[...new Set(visibleBrands.flatMap(b=>b.programs))];
  const allItems=marketingPlanItems(data.brands,plan?.month===month?plan.entries:[],data.socialCampaigns||[],data.messageTemplates||[],platformAudienceCatalog(data));
  const items=filterMarketingPlan(allItems,{month,brandId,kind,program});
  const first=new Date(month+"-01T12:00:00Z"),offset=first.getUTCDay();
  const days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  const dayItems=items.filter(i=>i.startDate<=selectedDate&&i.endDate>=selectedDate);
  const planningBrand=brandId==="all"?data.brands[0]?.id:brandId;
  const monthLabel=first.toLocaleDateString("en-US",{month:"long",year:"numeric",timeZone:"UTC"});
  return <div>
    <PageHeader title="Marketing calendar" description="Your monthly plan across companies, funding programs, email, text and social media." actions={<Link className={cn(buttonVariants({variant:"outline"}))} href={`/campaigns/calendar?brandId=${encodeURIComponent(planningBrand||"abstract")}&month=${month}`}>Plan email or text</Link>}/>
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <Button variant="outline" onClick={()=>moveMonth(-1)}>Previous month</Button>
      <label className="grid gap-1 text-sm">Month<Input aria-label="Calendar month" type="month" value={month} onChange={e=>chooseMonth(e.target.value)}/></label>
      <Button variant="outline" onClick={()=>moveMonth(1)}>Next month</Button>
      <Button variant="ghost" onClick={()=>chooseMonth(new Date().toLocaleDateString("en-CA",{timeZone:"America/New_York"}).slice(0,7))}>This month</Button>
    </div>
    <div className="mb-5 flex flex-wrap gap-2" aria-label={`Months in ${month.slice(0,4)}`}>{months.map((name,i)=><Button key={name} size="sm" variant={Number(month.slice(5))===i+1?"default":"outline"} onClick={()=>chooseMonth(`${month.slice(0,4)}-${String(i+1).padStart(2,"0")}`)}>{name}</Button>)}</div>
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1 text-sm">Company<select aria-label="Calendar company" className={field} value={brandId} onChange={e=>{setBrandId(e.target.value);setProgram("all");}}><option value="all">All companies</option>{data.brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Marketing type<select aria-label="Marketing type" className={field} value={kind} onChange={e=>setKind(e.target.value)}><option value="all">All marketing</option><option value="email">Email</option><option value="sms">Text</option><option value="social">Social media</option><option value="meta">Meta social</option><option value="tiktok">TikTok social</option><option value="google_ads">Google Ads</option><option value="seo">SEO</option></select></label>
      <label className="grid gap-1 text-sm">Funding program<select aria-label="Calendar funding program" className={field} value={program} onChange={e=>setProgram(e.target.value)}><option value="all">All programs</option>{programs.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
    </div>
    <div className="mb-5 rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4 text-sm">
      <strong>{monthLabel} · {items.length} scheduled {items.length===1?"plan":"plans"}</strong><p className="mt-1 text-[color:var(--ink-muted)]">Email/text calendar sending: {plan?.month===month?(plan.enabled?"ON":"OFF"):"loading…"}. Each item shows its saved status. Social, Google Ads and SEO entries show planned date ranges, not live publication. Ads templates appear through the campaigns using them. Viewing or filtering this calendar does not activate sending.</p>
    </div>
    {planError?<ErrorPanel message={planError} onRetry={()=>void load()}/>:null}
    {plan?.month!==month&&!planError?<LoadingPanel label="Loading monthly plan…"/>:null}
    <div className="overflow-x-auto"><div className="grid min-w-[820px] grid-cols-7 gap-2" aria-label="All marketing monthly calendar">
      {weekdays.map(d=><div key={d} className="p-2 text-center text-sm font-medium">{d}</div>)}
      {Array.from({length:offset},(_,i)=><div key={`blank-${i}`}/>)}
      {Array.from({length:days},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,"0")}`,scheduled=items.filter(item=>item.startDate<=date&&item.endDate>=date);return <div key={date} className={cn("min-h-36 rounded-xl border bg-[color:var(--panel)] p-2",date===selectedDate?"border-[color:var(--ink)] ring-1 ring-[color:var(--ink)]":"border-[color:var(--ink-border)]")}>
        <button type="button" aria-label={`View plans for ${date}`} aria-pressed={date===selectedDate} className="mb-2 w-full text-left text-sm font-medium hover:underline" onClick={()=>setSelectedDate(date)}>{i+1}<span className="ml-2 text-xs text-[color:var(--ink-muted)]">{scheduled.length?`${scheduled.length} planned`:""}</span></button>
        {scheduled.map(item=><Link key={item.id} href={item.href} className={cn("mb-2 block rounded-md border-l-4 bg-[color:var(--panel-hover)] p-2 text-xs hover:underline",kindStyle[item.kind])}><strong>{item.company}</strong><span className="mt-1 block">{item.programs.join(" + ")||item.title}</span><span className="mt-1 block">{marketingKindLabel[item.kind]} · {item.status}</span><span className="mt-1 block text-[color:var(--ink-muted)]">{item.planningOnly?"Campaign date range":item.time.split(" ")[0]}</span></Link>)}
      </div>;})}
    </div></div>
    {selectedDate?<section className="mt-5 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5"><h2 className="text-xl font-[family-name:var(--font-display)]">{selectedDate} · daily plan</h2>{dayItems.length?dayItems.map(item=><article key={item.id} className="mt-3 border-t border-[color:var(--ink-border)] pt-3 text-sm"><strong>{item.company} · {item.title}</strong><p>{marketingKindLabel[item.kind]} · {item.status} · {item.time}</p><p className="mt-1 text-[color:var(--ink-muted)]">{item.detail}</p>{item.planningOnly?<p className="mt-1">Planning only; this calendar does not publish posts, launch ads or update websites.</p>:null}<Link className="mt-2 inline-block underline" href={item.href}>Open {item.planningOnly?"social":"campaign"} plan</Link></article>):<p className="mt-3 text-sm text-[color:var(--ink-muted)]">No plans match these filters for this day.</p>}<div className="mt-4 flex flex-wrap gap-3"><Link className={cn(buttonVariants({variant:"outline"}))} href={`/campaigns/calendar?brandId=${encodeURIComponent(planningBrand||"abstract")}&month=${month}&date=${selectedDate}`}>Plan email or text this day</Link><Link className={cn(buttonVariants({variant:"outline"}))} href={`/social?entity=${encodeURIComponent(planningBrand||"abstract")}`}>Plan social media</Link></div></section>:null}
    <p className="mt-5 text-sm text-[color:var(--ink-muted)]">Campaigns without saved dates stay off the calendar. <Link className="underline" href={`/campaigns?brandId=${encodeURIComponent(planningBrand||"abstract")}&channel=email`}>Manage email/text campaigns</Link> · <Link className="underline" href={`/social?entity=${encodeURIComponent(planningBrand||"abstract")}`}>Manage social campaigns</Link> · <Link className="underline" href={`/creatives?brandId=${encodeURIComponent(planningBrand||"abstract")}`}>Ads library</Link></p>
  </div>;
}
export default function MarketingCalendarOverview(){return <Suspense fallback={<LoadingPanel/>}><CalendarOverviewInner/></Suspense>;}
