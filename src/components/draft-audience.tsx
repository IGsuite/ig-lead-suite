"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CampaignAudienceControls } from "@/components/campaign-audience-controls";
import { AUDIENCE_NOT_SELECTED } from "@/lib/audience-filters";
import type { Campaign, Lead } from "@/lib/types";

export function DraftAudience({campaign,sources,groups,leads,onSaved}:{campaign:Campaign;sources:string[];groups:string[];leads:Lead[];onSaved:()=>Promise<void>}) {
  const [source,setSource]=useState(campaign.sourceFilter);
  const [group,setGroup]=useState(campaign.groupFilter);
  const [mode,setMode]=useState(campaign.mode);
  const [saving,setSaving]=useState(false);
  async function save() {
    setSaving(true);
    try {
      const r=await fetch("/api/campaigns",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:campaign.id,sourceFilter:source,groupFilter:group,mode})});
      const json=await r.json();if(!r.ok)throw new Error(json.error||"Settings could not save");
      await onSaved();toast.success("Audience and run settings saved. Calendar days remain drafts.");
    }catch(e){toast.error(e instanceof Error?e.message:"Settings could not save");}finally{setSaving(false);}
  }
  return <div className="mt-3 max-w-xl space-y-3 whitespace-normal">
    <CampaignAudienceControls source={source} group={group} mode={mode} sources={sources} groups={groups} leads={leads} brandId={campaign.brandId} campaignId={campaign.id} disabled={saving} onSource={setSource} onGroup={setGroup} onMode={setMode} />
    <p className="max-w-xl text-xs text-[color:var(--ink-muted)]">Automatic runs require a saved valid contact for the channel: email for email, phone plus direct text permission for SMS. Basic verification checks format, not mailbox ownership or guaranteed delivery.</p>
    <Button size="sm" variant="outline" disabled={saving||source===AUDIENCE_NOT_SELECTED||(source===campaign.sourceFilter&&group===campaign.groupFilter&&mode===campaign.mode)} onClick={()=>void save()}>{saving?"Saving…":"Save audience & schedule"}</Button>
    <p className="max-w-xl text-xs text-[color:var(--ink-muted)]">Saving also updates this campaign’s untouched calendar drafts. It never approves dates or turns sending on.</p>
  </div>;
}
