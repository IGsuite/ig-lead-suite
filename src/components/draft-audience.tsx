"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AUDIENCE_NOT_SELECTED } from "@/lib/audience-filters";
import type { Campaign } from "@/lib/types";

export function DraftAudience({campaign,sources,groups,onSaved}:{campaign:Campaign;sources:string[];groups:string[];onSaved:()=>Promise<void>}) {
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
    <label className="grid gap-1 text-xs">Lead source<select aria-label={`Lead source for ${campaign.name}`} className={field} disabled={saving} value={source} onChange={e=>setSource(e.target.value)}>
      <option value={AUDIENCE_NOT_SELECTED}>Choose lead source</option><option value="all">All sources</option>
      {[...new Set([...sources,...(!["all",AUDIENCE_NOT_SELECTED].includes(campaign.sourceFilter)?[campaign.sourceFilter]:[])])].map(s=><option key={s} value={s}>{s}</option>)}
    </select></label>
    <label className="grid gap-1 text-xs">Lead group<select aria-label={`Lead group for ${campaign.name}`} className={field} disabled={saving} value={group} onChange={e=>setGroup(e.target.value)}><option value="all">All groups</option>{[...new Set([...groups,...(campaign.groupFilter!=="all"?[campaign.groupFilter]:[])])].map(g=><option key={g} value={g}>{g}</option>)}</select></label>
    <Button size="sm" variant="outline" disabled={saving || (source===campaign.sourceFilter && group===campaign.groupFilter)} onClick={()=>void save()}>{saving?"Saving…":"Save audience"}</Button>
    {campaign.sourceFilter===AUDIENCE_NOT_SELECTED?<span className="text-xs text-[color:var(--ink-muted)]">Select and save a source before Launch.</span>:null}
  </div>;
}
