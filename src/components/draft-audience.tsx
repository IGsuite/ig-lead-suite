"use client";
import { leadSourceLabel } from "@/lib/manual-packages";
import type { Lead } from "@/lib/types";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AUDIENCE_NOT_SELECTED, parseAudienceFilter, serializeAudienceFilter } from "@/lib/audience-filters";
import type { Campaign } from "@/lib/types";

export function DraftAudience({campaign,sources,groups,leads,onSaved}:{campaign:Campaign;sources:string[];groups:string[];leads:Lead[];onSaved:()=>Promise<void>}) {
  const [source,setSource] = useState(campaign.sourceFilter);
  const [group,setGroup] = useState(campaign.groupFilter);
  const [saving,setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const r=await fetch("/api/campaigns",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:campaign.id,sourceFilter:source,groupFilter:group})});
      const json=await r.json();if(!r.ok)throw new Error(json.error||"Audience could not save");
      await onSaved();toast.success("Audience saved. Campaign remains a draft.");
    } catch(e) {toast.error(e instanceof Error?e.message:"Audience could not save");}
    finally {setSaving(false);}
  }
  const field="max-w-48 rounded-md border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-1 text-xs";
  return <div className="mt-3 flex flex-wrap items-end gap-2">
    <fieldset disabled={saving} className="min-w-48 text-xs"><legend>Lead sources</legend><details className={field}><summary className="cursor-pointer">{source===AUDIENCE_NOT_SELECTED?"Choose lead sources":source==="all"?"All sources":parseAudienceFilter(source).length+" selected"}</summary>
      <label className="my-2 flex gap-2"><input type="checkbox" checked={source==="all"} onChange={e=>setSource(e.target.checked?"all":AUDIENCE_NOT_SELECTED)} />All sources</label>
      <div className="max-h-40 space-y-2 overflow-auto">{[...new Set([...sources,...(Array.isArray(parseAudienceFilter(campaign.sourceFilter)) && campaign.sourceFilter!==AUDIENCE_NOT_SELECTED ? parseAudienceFilter(campaign.sourceFilter) as string[]:[])])].map(s=><label key={s} className="flex gap-2"><input type="checkbox" checked={source==="all" || (Array.isArray(parseAudienceFilter(source)) && (parseAudienceFilter(source) as string[]).includes(s))} onChange={e=>{const parsed=parseAudienceFilter(source);const values=source===AUDIENCE_NOT_SELECTED?[]:parsed==="all"?[...sources]:parsed;const next=e.target.checked?[...values,s]:values.filter(v=>v!==s);setSource(next.length?serializeAudienceFilter(next):AUDIENCE_NOT_SELECTED);}} />{leadSourceLabel(s,leads)}</label>)}</div>
    </details></fieldset>
    <label className="grid gap-1 text-xs">Lead group<select aria-label={`Lead group for ${campaign.name}`} className={field} disabled={saving} value={group} onChange={e=>setGroup(e.target.value)}><option value="all">All groups</option>{[...new Set([...groups,...(campaign.groupFilter!=="all"?[campaign.groupFilter]:[])])].map(g=><option key={g} value={g}>{g}</option>)}</select></label>
    <Button size="sm" variant="outline" disabled={saving || (source===campaign.sourceFilter && group===campaign.groupFilter)} onClick={()=>void save()}>{saving?"Saving…":"Save audience"}</Button>
    {campaign.sourceFilter===AUDIENCE_NOT_SELECTED?<span className="text-xs text-[color:var(--ink-muted)]">Select and save a source before Launch. This also fills calendar drafts waiting for an audience.</span>:null}
  </div>;
}
