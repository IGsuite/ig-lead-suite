"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AUDIENCE_NOT_SELECTED, parseAudienceFilter, serializeAudienceFilter } from "@/lib/audience-filters";
import { leadSourceLabel } from "@/lib/manual-packages";
import type { CampaignPoolMode, Lead } from "@/lib/types";

export function CampaignAudienceControls({source,group,mode,sources,groups,leads,brandId,campaignId,disabled,onSource,onGroup,onMode}:{
  source:string;group:string;mode:CampaignPoolMode;sources:string[];groups:string[];leads:Lead[];brandId:string;campaignId?:string;disabled?:boolean;
  onSource:(value:string)=>void;onGroup:(value:string)=>void;onMode:(value:CampaignPoolMode)=>void;
}) {
  const parsed=parseAudienceFilter(source);
  const selected=source===AUDIENCE_NOT_SELECTED||parsed==="all"?[]:parsed;
  const options=[...new Set([...sources,...selected])];
  const parsedGroups=parseAudienceFilter(group);
  const selectedGroups=group===AUDIENCE_NOT_SELECTED||parsedGroups==="all"?[]:parsedGroups;
  const field="rounded-md border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2 text-xs";
  return <fieldset disabled={disabled} className="mt-3 min-w-64 max-w-xl space-y-3 whitespace-normal text-xs">
    <legend className="font-medium">Audience & schedule</legend>
    <div className="flex flex-wrap gap-2" aria-label="Audience selection">
      <Button type="button" size="sm" aria-pressed={source==="all"} variant={source==="all"?"default":"outline"} onClick={()=>{onSource("all");onGroup("all");}}>Pool — all leads</Button>
      <Button type="button" size="sm" aria-pressed={source!=="all"} variant={source!=="all"?"default":"outline"} onClick={()=>{if(source==="all")onSource(AUDIENCE_NOT_SELECTED);}}>Selected lists / manual packages</Button>
    </div>
    <p className="max-w-xl text-[color:var(--ink-muted)]">{source==="all"?"Shared pool across every CSV, source and manual package. Each scheduled day draws its own eligible batch.":"Choose one or more sources. A source is the CSV, provider or manual package a contact came from. Overlapping contacts are counted once."}</p>
    {source!=="all"?<div className={`${field} max-h-40 space-y-2 overflow-auto`} aria-label="Selected lead lists">
      {options.length?options.map(s=><label key={s} className="flex gap-2"><input type="checkbox" checked={selected.includes(s)} onChange={e=>{const next=e.target.checked?[...selected,s]:selected.filter(v=>v!==s);onSource(next.length?serializeAudienceFilter(next):AUDIENCE_NOT_SELECTED);}} />{leadSourceLabel(s,leads)}</label>):<p>No lists yet. Import a CSV or add a manual package in Leads.</p>}
    </div>:null}
    <details><summary className="cursor-pointer">Optional group filter{group!=="all"?` — ${selectedGroups.length} selected`:" — all groups"}</summary>
      <p className="my-2 max-w-xl text-[color:var(--ink-muted)]">A group is an extra label inside your leads, such as a purchased batch. It narrows the chosen pool or lists. Leave All groups to use the full audience.</p>
      <div className={`${field} max-h-40 max-w-80 space-y-2 overflow-auto`} aria-label="Optional lead groups">
        <label className="flex gap-2"><input type="checkbox" checked={group==="all"} onChange={e=>onGroup(e.target.checked?"all":AUDIENCE_NOT_SELECTED)} />All groups</label>
        {[...new Set([...groups,...selectedGroups])].map(g=><label key={g} className="flex gap-2"><input type="checkbox" checked={group==="all"||selectedGroups.includes(g)} onChange={e=>{const previous=group==="all"?[...groups]:selectedGroups;const next=e.target.checked?[...previous,g]:previous.filter(v=>v!==g);onGroup(next.length?serializeAudienceFilter(next):AUDIENCE_NOT_SELECTED);}} />{g}</label>)}
      </div>
    </details>
    <label className="grid max-w-80 gap-1">Run campaign<select aria-label="Run campaign" className={field} value={mode} onChange={e=>onMode(e.target.value==="auto"?"auto":"own")}><option value="own">One-time batch</option><option value="auto">Automatic — follow calendar</option></select></label>
    <p className="max-w-xl text-[color:var(--ink-muted)]">{mode==="auto"?"Only approved calendar dates run, using each date’s quantity and time. Contacts already queued or sent on another day of this plan are not reused. A short pool sends fewer contacts; it never fills the gap with repeats.":"Launch sends one eligible batch. It does not repeat every day."}</p>
    {mode==="auto"&&campaignId?<Link className="inline-block underline" href={`/campaigns/calendar?brandId=${encodeURIComponent(brandId)}&campaignId=${encodeURIComponent(campaignId)}`}>Plan dates in calendar</Link>:mode==="auto"?<p>Save this campaign first, then plan its calendar dates.</p>:null}
  </fieldset>;
}
