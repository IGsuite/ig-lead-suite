"use client";

import Link from "next/link";
import {leadSourceLabel} from "@/lib/manual-packages";
import { ProgramSelect } from "@/components/program-select";
import { programTemplateMatches } from "@/lib/programs";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlatform } from "@/hooks/use-platform";
import type { CalendarEntry } from "@/lib/marketing-calendar";

const field = "w-full rounded-md border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2 text-sm";
const panel = "rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5";
const weekdays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
type CalendarState = {entries:CalendarEntry[]; enabled:boolean; canManage:boolean; readiness:{email:boolean;sms:boolean}};
function CalendarInner() {
  const {data,loading,error,refresh} = usePlatform();
  const params = useSearchParams();
  const [brandId,setBrandId] = useState(params.get("brandId") || "abstract");
  const [month,setMonth] = useState(()=>/^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("month")||"") ? params.get("month")! : new Date().toLocaleDateString("en-CA",{timeZone:"America/New_York"}).slice(0,7));
  const [calendar,setCalendar] = useState<CalendarState | null>(null);
  const [calendarError,setCalendarError] = useState("");
  const [busy,setBusy] = useState(false);
  const [programs,setPrograms] = useState<string[]>([]);
  const product=programs.length ? programs.join(" + ") : "General";
  const [campaignId,setCampaignId] = useState("");
  const [templateId,setTemplateId] = useState("");
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date")||"") ? params.get("date")! : "";
  const [startDate,setStartDate] = useState(requestedDate);
  const [endDate,setEndDate] = useState(requestedDate);
  const [days,setDays] = useState(requestedDate ? [new Date(requestedDate+"T12:00:00Z").getUTCDay()] : [1,2,3,4,5]);
  const [startTime,setStartTime] = useState("09:00");
  const [endTime,setEndTime] = useState("20:00");
  const [timezone,setTimezone] = useState("America/New_York");
  const [volume,setVolume] = useState(1);
  const [throttle,setThrottle] = useState(15);
  const [selected,setSelected] = useState<string[]>([]);
  const load = useCallback(async (signal?:AbortSignal) => {
    if (signal?.aborted) return;
    try {
      const r = await fetch(`/api/marketing-calendar?brandId=${encodeURIComponent(brandId)}&month=${month}`,{signal});
      const json = await r.json(); if (!r.ok) throw new Error(json.error || "Calendar could not load");
      if (!signal?.aborted) {setCalendar(json);setCalendarError("");setSelected([]);}
    } catch (e) {if (!signal?.aborted) setCalendarError(e instanceof Error ? e.message:"Calendar could not load");}
  },[brandId,month]);
  useEffect(()=>{const controller = new AbortController(); void Promise.resolve().then(()=>load(controller.signal)); return ()=>controller.abort();},[load]);
  async function act(body:object) {
    setBusy(true);
    try {
      const r = await fetch("/api/marketing-calendar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const json = await r.json(); if (!r.ok) throw new Error(json.error || "Calendar change failed");
      toast.success("Calendar saved"); await Promise.all([load(),refresh()]);
    } catch(e) {toast.error(e instanceof Error ? e.message:"Calendar change failed");}
    finally {setBusy(false);}
  }
  if (loading) return <LoadingPanel />;
  if (error || !data) return <ErrorPanel message={error || "Workspace unavailable"} onRetry={refresh} />;
  const brand = data.brands.find(b=>b.id === brandId);
  const campaigns = data.campaigns.filter(c=>c.brandId === brandId && !c.id.startsWith("camp-calendar-") && (!programs.length || (c.programs?.length===programs.length && programs.every(p=>c.programs?.includes(p)))));
  const campaign = campaigns.find(c=>c.id === campaignId);
  const templates = data.messageTemplates.filter(t=>campaign && programTemplateMatches(t,brandId,campaign.programs || [],campaign.channel));
  const entries = calendar?.entries || [];
  const monthDate = new Date(month+"-01T12:00:00Z");
  const count = new Date(Date.UTC(monthDate.getUTCFullYear(),monthDate.getUTCMonth()+1,0)).getUTCDate();
  const offset = monthDate.getUTCDay();
  const changeMonth = (delta:number) => {const d = new Date(month+"-01T12:00:00Z");d.setUTCMonth(d.getUTCMonth()+delta);setMonth(d.toISOString().slice(0,7));};
  const draftIds = entries.filter(e=>["draft","paused","approved"].includes(e.status)).map(e=>e.id);
  return <div>
    <PageHeader title="Email & text calendar" description="Plan each company’s product campaigns by day. Saving creates drafts. Approve selected days, then enable the calendar when you are ready to send." actions={<div className="flex gap-4"><Link className="text-sm underline" href={`/calendar?brandId=${brandId}&month=${month}`}>All marketing calendar</Link><Link className="text-sm underline" href={`/campaigns?brandId=${brandId}&channel=email`}>Back to campaigns</Link></div>} />
    <div className="mb-5 flex flex-wrap items-end gap-4">
      <label className="space-y-1 text-sm">Company<select aria-label="Company" className={field} value={brandId} onChange={e=>{setBrandId(e.target.value);setCampaignId("");setTemplateId("");setPrograms([]);setCalendar(null);}}>{data.brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <Button variant="outline" onClick={()=>changeMonth(-1)}>Previous month</Button>
      <label className="space-y-1 text-sm">Month<Input aria-label="Month" type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}} /></label>
      <Button variant="outline" onClick={()=>changeMonth(1)}>Next month</Button>
      <strong className="text-sm">Calendar sending: {calendar?.enabled ? "ON":"OFF"}</strong>
    </div>
    <div className={`${panel} mb-5 text-sm`}>
      <p>Email: {calendar?.readiness.email ? "available for approved launches":"not enabled"} · Text: {calendar?.readiness.sms ? "available for approved launches":"not enabled — drafts only"}.</p>
      <p className="mt-2 text-[color:var(--ink-muted)]">Every day creates a separate campaign ID and selects fresh eligible leads from the saved audience. Opt-outs, text permission, message cooldowns and sender limits apply. The time is the sending start; delivery is paced by your provider. Missed days are skipped. Pausing stops new submissions; messages already accepted by the provider may still send.</p>
      {calendar?.canManage ? <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || !selected.length} onClick={()=>{if(!calendar.enabled || window.confirm("Calendar sending is ON. Approving due entries can start sending now. Approve selected days?")) void act({action:"approve",ids:selected});}}>Approve selected days ({selected.length})</Button>
        <Button variant="outline" disabled={busy || !selected.length} onClick={()=>void act({action:"pause",ids:selected})}>Pause selected days</Button>
        <Button variant="outline" disabled={busy || !entries.length} onClick={()=>setSelected(draftIds)}>Select editable days this month</Button>
        <Button disabled={busy || !calendar} variant={calendar.enabled ? "destructive":"default"} onClick={()=>{
          if (calendar.enabled || window.confirm("Enable approved calendar entries across all companies? Due entries can start sending now. Generic Autopilot rotation will turn off.")) void act({action:calendar.enabled ? "disable":"enable"});
        }}>{calendar.enabled ? "Turn calendar off":"Enable approved calendar"}</Button>
      </div>:null}
    </div>
    {calendarError ? <ErrorPanel message={calendarError} onRetry={()=>void load()} />:null}
    <div className="mb-6 overflow-x-auto">
      <div className="grid min-w-[760px] grid-cols-7 gap-2" aria-label="Monthly campaign calendar">
        {weekdays.map(d=><div key={d} className="p-2 text-center text-sm font-medium">{d}</div>)}
        {Array.from({length:offset},(_,i)=><div key={`blank-${i}`} />)}
        {Array.from({length:count},(_,i)=>{
          const date = `${month}-${String(i+1).padStart(2,"0")}`;
          return <div key={date} className="min-h-32 rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2">
            <button type="button" className="mb-2 text-sm font-medium hover:underline" onClick={()=>{setStartDate(date);setEndDate(date);setDays([new Date(date+"T12:00:00Z").getUTCDay()]);}} aria-label={`Plan ${date}`}>{i+1}</button>
            {entries.filter(e=>e.date === date).map(e=><label key={e.id} className="mb-2 block rounded-lg bg-[color:var(--panel-soft)] p-2 text-xs">
              {calendar?.canManage ? <input type="checkbox" aria-label={`Select ${e.product} ${e.date} ${e.startTime}`} checked={selected.includes(e.id)} onChange={v=>setSelected(s=>v.target.checked?[...s,e.id]:s.filter(id=>id!==e.id))} className="mr-1" />:null}
              <strong>{e.product}</strong><br />{e.channel === "sms"?"Text":"Email"} · {e.startTime}–{e.endTime}<br />{e.status} · {e.snapshot.volume} contacts
              <details className="mt-1"><summary>Copy & details</summary><p className="mt-1">{e.snapshot.name}<br />{e.timezone}<br />Audience: {leadSourceLabel(e.snapshot.sourceFilter,data.leads)} / {e.snapshot.groupFilter}<br />ID: {e.id}</p>{e.snapshot.subject ? <p className="mt-1 font-medium">{e.snapshot.subject}</p>:null}<pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">{e.snapshot.message}</pre>{e.error ? <p className="mt-1">{e.error}</p>:null}</details>
            </label>)}
          </div>;
        })}
      </div>
    </div>
    {calendar?.canManage ? <form className={panel} onSubmit={e=>{e.preventDefault();void act({brandId,product:campaign?.programs?.length ? campaign.programs.join(" + ") : product,campaignId,templateId:templateId || undefined,startDate,endDate,weekdays:days,startTime,endTime,timezone,volume,throttlePerHour:throttle});}}>
      <h2 className="mb-2 text-xl font-[family-name:var(--font-display)]">Add product campaign days</h2>
      <p className="mb-4 text-sm text-[color:var(--ink-muted)]">Choose an existing campaign as the starting copy and audience, or <Link className="underline" href={`/campaigns/new?brandId=${brandId}&channel=email`}>build a campaign</Link> first. Selected copy is saved as a snapshot; later edits will not change these days. Plan up to 12 months ahead.</p>
      <div className="grid gap-4 md:grid-cols-3">
        <ProgramSelect brand={brand} value={programs} onChange={p=>{setPrograms(p);setCampaignId("");setTemplateId("");}} />
        <label className="space-y-1 text-sm">Campaign<select className={field} required value={campaignId} onChange={e=>{setCampaignId(e.target.value);setTemplateId("");setPrograms(campaigns.find(c=>c.id===e.target.value)?.programs || []);}}><option value="">Choose campaign</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name} ({c.channel})</option>)}</select></label>
        <label className="space-y-1 text-sm">Template<select className={field} value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Use campaign’s saved copy & artwork</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="space-y-1 text-sm">First day<Input type="date" required value={startDate} onChange={e=>setStartDate(e.target.value)} /></label>
        <label className="space-y-1 text-sm">Last day<Input type="date" required value={endDate} onChange={e=>setEndDate(e.target.value)} /></label>
        <label className="space-y-1 text-sm">Timezone<Input required value={timezone} onChange={e=>setTimezone(e.target.value)} /></label>
        <label className="space-y-1 text-sm">Start time<Input type="time" min="09:00" max="19:59" required value={startTime} onChange={e=>setStartTime(e.target.value)} /></label>
        <label className="space-y-1 text-sm">End time<Input type="time" min="09:01" max="20:00" required value={endTime} onChange={e=>setEndTime(e.target.value)} /></label>
        <label className="space-y-1 text-sm">Contacts per day<Input type="number" min={1} max={20000} required value={volume} onChange={e=>setVolume(Number(e.target.value))} /></label>
        <label className="space-y-1 text-sm">Maximum contacts per hour<Input type="number" min={1} max={20000} required value={throttle} onChange={e=>setThrottle(Number(e.target.value))} /></label>
      </div>
      <fieldset className="my-4"><legend className="mb-2 text-sm">Repeat on selected weekdays</legend><div className="flex flex-wrap gap-4">{weekdays.map((d,i)=><label key={d} className="text-sm"><input type="checkbox" checked={days.includes(i)} onChange={e=>setDays(s=>e.target.checked?[...s,i]:s.filter(v=>v!==i))} /> {d}</label>)}</div></fieldset>
      {campaign ? <p className="mb-3 text-sm">Saved audience: <strong>{leadSourceLabel(campaign.sourceFilter,data.leads)} / {campaign.groupFilter}</strong> · {campaign.channel === "sms"?"Text":"Email"}. Change the starting campaign to use a different audience.</p>:null}
      <Button type="submit" disabled={busy || !campaign || !days.length}>{busy?"Saving…":"Save calendar drafts — no sending"}</Button>
    </form>:null}
  </div>;
}
export default function CalendarPage() { return <Suspense fallback={<LoadingPanel />}><CalendarInner /></Suspense>; }
