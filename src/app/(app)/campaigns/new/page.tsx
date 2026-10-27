"use client";

import Link from "next/link";
import { platformSourceOptions, platformAudienceCatalog } from "@/lib/manual-packages";
import { CampaignAudienceControls } from "@/components/campaign-audience-controls";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, useEffect, useRef } from "react";
import { ProgramSelect } from "@/components/program-select";
import { programTemplateMatches, programDraft } from "@/lib/programs";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePlatform } from "@/hooks/use-platform";
import {
  serializeAudienceFilter,
  AUDIENCE_NOT_SELECTED,
} from "@/lib/audience-filters";
import type {
  CampaignChannel,
  CampaignPoolMode,
  SendWindowPreset,
} from "@/lib/types";
import { draftFingerprint, smsSegmentCount, approvedProgramArtwork } from "@/lib/campaign-draft";
import { buildEmailBodies, applyEmailTokens } from "@/lib/email-html";

type DraftTone = "soft" | "growth";

function CampaignBuilderInner() {
  const { data, loading, error, refresh } = usePlatform({ omitLeads: true });
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [savedId, setSavedId] = useState(searchParams.get("campaignId") || "");
  const [savedRevision, setSavedRevision] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [reviewedKey, setReviewedKey] = useState("");
  const [formError, setFormError] = useState("");
  const [aiMode, setAiMode] = useState("checking");
  const hydrated = useRef("");
  const [brandId, setBrandId] = useState(
    searchParams.get("brandId") || "abstract",
  );
  const initialChannel: CampaignChannel =
    searchParams.get("channel") === "email" ? "email" : "sms";
  const [channel, setChannel] = useState<CampaignChannel>(initialChannel);
  const initialCopy = programDraft(searchParams.getAll("program"), initialChannel, { id: searchParams.get("brandId") || "abstract" });
  const [programs, setPrograms] = useState<string[]>(searchParams.getAll("program"));
  const [mode, setMode] = useState<CampaignPoolMode>("own");
  const [name, setName] = useState(
    initialChannel === "email"
      ? "New email campaign"
      : "New SMS campaign",
  );
  const [subject, setSubject] = useState(initialCopy.subject);
  const [message, setMessage] = useState(initialCopy.message);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [sourceFilter, setSourceFilter] = useState(()=>serializeAudienceFilter(searchParams.getAll("source")));
  const [groupFilter, setGroupFilter] = useState("all");
  const [preferUnoffered, setPreferUnoffered] = useState(true);
  const [preferVerified, setPreferVerified] = useState(true);
  const [volume, setVolume] = useState(100);
  const [throttlePerHour, setThrottlePerHour] = useState(120);
  const [sendWindowPreset, setSendWindowPreset] =
    useState<SendWindowPreset>("custom");
  const [sendWindowStart, setSendWindowStart] = useState("09:00");
  const [sendWindowEnd, setSendWindowEnd] = useState("20:00");
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftTone, setDraftTone] = useState<DraftTone>("soft");
  const [templateId, setTemplateId] = useState("");

  const sources = useMemo(() => {
    if (!data) return [];
    return platformSourceOptions(data);
  }, [data]);

  const usableTemplates = useMemo(() => {
    if (!data) return [];
    return (data.messageTemplates || []).filter(
      (t) =>
        programTemplateMatches(t,brandId,programs,channel),
    );
  }, [data, channel, brandId, programs]);

  const groups = useMemo(() => {
    if (!data) return [];
    return data.leadSummary?.groups || Array.from(new Set(data.leads.map((l) => l.groupName))).sort();
  }, [data]);

  const [audienceCount,setAudienceCount]=useState<number|null>(null);
  useEffect(()=>{
    const abort=new AbortController();
    const timer=setTimeout(async()=>{
      setAudienceCount(null);
      try{
        const params=new URLSearchParams({brandId,channel,source:sourceFilter,group:groupFilter,unoffered:String(mode==="own"&&preferUnoffered),verified:String(mode==="auto"||preferVerified)});
        const response=await fetch('/api/leads/audience?'+params,{signal:abort.signal});
        if(!response.ok)throw Error('Audience unavailable');const json=await response.json();
        if(!abort.signal.aborted)setAudienceCount(json.count);
      }catch{if(!abort.signal.aborted)setAudienceCount(null);}
    },300);
    return()=>{clearTimeout(timer);abort.abort();};
  },[sourceFilter,groupFilter,channel,mode,preferUnoffered,preferVerified,brandId]);

  async function draftWithAi() {
    setDrafting(true);
    try {
      const res = await fetch("/api/campaigns/draft-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          brandId,
          programs,
          tone: draftTone,
        }),
      });
      const payload = (await res.json()) as {
        error?: string;
        subject?: string;
        message?: string;
        notice?: string;
        mode?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error || "Draft failed");
      }
      if (!payload.message?.trim()) {
        throw new Error("No message returned");
      }
      setMessage(payload.message);
      if (channel === "email" && payload.subject?.trim()) {
        setSubject(payload.subject.trim());
      }
      if (payload.notice) {
        toast.message(payload.notice);
      } else {
        toast.success(
          payload.mode === "live"
            ? "Draft filled with ChatGPT"
            : "Draft filled",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  }

  async function create(status: "draft" | "scheduled") {
    if (!validateStep(status === "scheduled" ? 6 : Math.min(step, 2))) return;
    if (status === "scheduled" && mode === "own" && reviewedKey !== reviewKey) { setFormError("Review the company, message and audience before launching."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: savedId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(savedId ? { id:savedId, expectedRevision:savedRevision } : {}),
          brandId,
          programs,
          name,
          channel,
          subject: channel === "email" ? subject : undefined,
          message,
          htmlMessage: channel === "email" && /<(html|table|div|p)\b/i.test(message) ? message : null,
          imageUrl: channel === "email" ? imageUrl.trim() || null : null,
          imageAlt: channel === "email" ? imageAlt.trim() || null : null,
          sourceFilter,
          groupFilter,
          preferUnoffered,
          preferVerified,
          mode,
          volume,
          throttlePerHour,
          sendWindowPreset,
          sendWindowStart:
            sendWindowPreset === "custom" ? sendWindowStart : undefined,
          sendWindowEnd:
            sendWindowPreset === "custom" ? sendWindowEnd : undefined,
          timezone: "America/New_York",
          status: "draft",
        }),
      });
      if (!res.ok) { const failed=await res.json(); throw new Error(failed.error || "Could not create campaign"); }
      const campaign = (await res.json()) as { id: string; draftRevision:string };
      hydrated.current = campaign.id; setSavedId(campaign.id); setSavedRevision(campaign.draftRevision); setSavedAt(new Date().toLocaleTimeString());
      if (mode === "auto" && status === "scheduled") {
        toast.success("Automatic campaign saved as a draft. Plan and approve its calendar dates when ready.");
        await refresh();
        router.push(`/campaigns/calendar?brandId=${brandId}&campaignId=${campaign.id}&volume=${volume}&throttle=${throttlePerHour}`);
        return;
      }
      if (status === "scheduled") {
        const launchRes = await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "launch", id: campaign.id }),
        });
        const launched = (await launchRes.json()) as {
          error?: string;
          deferred?: boolean;
          deferredReason?: string;
          windowLabel?: string;
          emptyAudience?: boolean;
          eligibleCount?: number;
        };
        if (!launchRes.ok) throw new Error(launched.error || "Your draft was saved, but the campaign could not be launched.");
        if (launched.deferred && launched.deferredReason !== "outside_send_window") {
          toast.message(`Campaign is ${launched.deferredReason || "already being processed"}.`);
        } else if (launched.deferred) {
          toast.message(
            `Scheduled for automatic processing during the send window (${launched.windowLabel || "window"}).`,
          );
        } else if (launched.emptyAudience) {
          toast.error(
            "No eligible leads matched (source/group, verified-only, or “not yet offered this entity”). Widen filters or uncheck Prefer unoffered, then launch again.",
          );
        } else {
          const n = launched.eligibleCount;
          const countLabel = typeof n === "number" ? `${n} contact(s) ` : "";
          toast.success(
            channel === "email"
              ? `Queued ${countLabel}for email processing within your sending window and mailbox limits`
              : `Queued ${countLabel}for text processing within your sending window`,
          );
        }
      } else {
        toast.success("Draft campaign saved");
      }
      if (status === "scheduled") { await refresh(); router.push(`/campaigns?brandId=${brandId}&channel=${channel}`); }
      else router.replace(`/campaigns/new?brandId=${brandId}&channel=${channel}&campaignId=${campaign.id}`);
    } catch (err) {
      const detail=err instanceof Error ? err.message : "Save failed"; setFormError(detail); toast.error(detail);
    } finally {
      setSaving(false);
    }
  }

  function changePrograms(next: string[], nextChannel=channel, nextBrandId=brandId) {
    setPrograms(next);setTemplateId("");setImageUrl("");setImageAlt("");
    const draft=programDraft(next,nextChannel,{id:nextBrandId});setSubject(draft.subject);setMessage(draft.message);
    setName(`${data?.brands.find(b=>b.id===nextBrandId)?.shortName || "Company"} — ${next.join(" + ") || "General"} — ${nextChannel}`);
  }

  const reviewKey=JSON.stringify([brandId,programs,channel,name,subject,message,imageUrl,imageAlt,sourceFilter,groupFilter,mode,volume,throttlePerHour,sendWindowPreset,sendWindowStart,sendWindowEnd,preferVerified,preferUnoffered]);
  const steps=["Company","Program & channel","Message","Image","Audience","Schedule","Review & launch"];
  useEffect(()=>{let active=true;void fetch('/api/creatives/generate').then(r=>r.json()).then(d=>{if(active)setAiMode(d.mode||"demo");}).catch(()=>{if(active)setAiMode("unavailable");});return()=>{active=false;};},[]);
  useEffect(()=>{
    const original=data?.campaigns.find(c=>c.id===savedId);
    if(!savedId||!original||hydrated.current===savedId)return;
    let active=true;
    void draftFingerprint(original).then(version=>{
      if(!active)return;
      if(original.status!=="draft"){setFormError("This campaign already started. Its saved content is preserved; create a new draft for changes.");return;}
      hydrated.current=savedId;setSavedRevision(version);setBrandId(original.brandId);setPrograms(original.programs||[]);setChannel(original.channel);setName(original.name);setSubject(original.subject||"");setMessage(original.htmlMessage||original.message);setImageUrl(original.imageUrl||"");setImageAlt(original.imageAlt||"");setSourceFilter(original.sourceFilter);setGroupFilter(original.groupFilter);setPreferUnoffered(original.preferUnoffered);setPreferVerified(original.preferVerified);setMode(original.mode);setVolume(original.volume);setThrottlePerHour(original.throttlePerHour);setSendWindowPreset(original.sendWindowPreset||"any");setSendWindowStart(original.sendWindowStart||"09:00");setSendWindowEnd(original.sendWindowEnd||"20:00");
    });return()=>{active=false;};
  },[data,savedId]);
  function validateStep(through:number) {
    let problem="";
    if(!data?.brands.some(b=>b.id===brandId))problem="Choose your company.";
    else if(through>=2&&(!name.trim()||!message.trim()||(channel==="email"&&!subject.trim())))problem="Enter a campaign name, message and email subject where applicable.";
    else if(through>=3&&imageUrl){try{const u=new URL(imageUrl);if(u.protocol!=="https:"||u.username||u.password)problem="Use a public HTTPS image link.";}catch{problem="Enter a valid image URL or leave the image blank.";}}
    if(!problem&&through>=4&&(sourceFilter===AUDIENCE_NOT_SELECTED||groupFilter===AUDIENCE_NOT_SELECTED))problem="Choose a pool or at least one lead list and group.";
    if(!problem&&through>=5&&(!Number.isInteger(volume)||volume<1||!Number.isInteger(throttlePerHour)||throttlePerHour<1))problem="Enter positive whole numbers for the quantity and sending speed.";
    if(!problem&&through>=5&&sendWindowPreset==="custom"&&sendWindowStart>=sendWindowEnd)problem="Choose an end time later than the start time.";
    setFormError(problem);return !problem;
  }
  const preview=useMemo(()=>buildEmailBodies({message,htmlMessage:channel==="email"&&/<(?:html|table|div|p)\b/i.test(message)?message:null,imageUrl,imageAlt,vars:{firstName:"Alex",brand:data?.brands.find(b=>b.id===brandId)?.shortName||"Your company"}}),[message,imageUrl,imageAlt,channel,data,brandId]);
  if(loading)return <LoadingPanel/>;
  if(error||!data)return <ErrorPanel message={error||"Could not load the campaign builder"} onRetry={refresh}/>;
  const company=data.brands.find(b=>b.id===brandId);
  const field="grid gap-2 text-sm";
  const control="w-full rounded-lg border border-[color:var(--ink-border)] bg-[color:var(--panel)] px-3 py-2 text-[color:var(--ink)]";
  const pane="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5";
  const availableArtwork=brandId==="abstract"?Object.entries(approvedProgramArtwork).filter(([program])=>!programs.length||programs.includes(program)):[];
  return <div>
    <PageHeader title={savedId?"Edit campaign draft":"Create a campaign"} description="Build one company’s campaign step by step. Saving a draft never sends messages." actions={<Link href={`/campaigns?brandId=${brandId}&channel=${channel}`} className={buttonVariants({variant:"outline"})}>Campaign library</Link>}/>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[color:var(--panel)] p-4 text-sm"><strong>{company?.name} · {programs.join(" + ")||"General / unassigned"} · {channel==="sms"?"Text":"Email"}</strong><span role="status" className="text-[color:var(--ink-muted)]">{saving?"Saving…":savedAt?`Draft saved at ${savedAt}`:savedId?"Saved draft — review changes before saving":"Unsaved draft"}</span></div>
    <nav aria-label="Campaign steps" className="mb-5 flex flex-wrap gap-2">{steps.map((label,index)=><Button key={label} type="button" size="sm" variant={step===index?"default":"outline"} aria-current={step===index?"step":undefined} disabled={saving||index>step} onClick={()=>{setStep(index);setFormError("");}}>{index+1}. {label}</Button>)}</nav>
    <div className="grid items-start gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <form className={`${pane} space-y-5`} onSubmit={e=>{e.preventDefault();void create("draft");}}>
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Step {step+1}: {steps[step]}</h2>
        {step===0&&<><label className={field}>Company<select aria-label="Campaign company" className={control} value={brandId} disabled={Boolean(savedId)} onChange={e=>{setBrandId(e.target.value);changePrograms([],channel,e.target.value);}}>{data.brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><p className="text-sm text-[color:var(--ink-muted)]">Templates, artwork, audience rules and replies stay with this company. Company and channel are locked after the first save.</p></>}
        {step===1&&<><ProgramSelect brand={company} value={programs} onChange={changePrograms}/><label className={field}>Delivery channel<select aria-label="Delivery channel" className={control} value={channel} disabled={Boolean(savedId)} onChange={e=>{const next=e.target.value as CampaignChannel;setChannel(next);changePrograms(programs,next);}}><option value="email">Email</option><option value="sms">Text message (SMS)</option></select></label><p className="text-sm text-[color:var(--ink-muted)]">Choose multiple programs when needed. For social posts and ads, use <Link href={`/social?entity=${brandId}`} className="underline">this company’s social workspace</Link>.</p></>}
        {step===2&&<><label className={field}>Campaign name<Input aria-label="Campaign name" value={name} onChange={e=>setName(e.target.value)}/></label><label className={field}>Saved template<select aria-label="Saved template" className={control} value={templateId} onChange={e=>{setTemplateId(e.target.value);const t=usableTemplates.find(t=>t.id===e.target.value);if(t){setMessage(t.body);setSubject(t.subject||"");setImageUrl("");setImageAlt("");}}}><option value="">Write your own / keep current wording</option>{usableTemplates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>{channel==="email"&&<label className={field}>Email subject<Input aria-label="Email subject" value={subject} onChange={e=>setSubject(e.target.value)}/></label>}<label className={field}>Message<Textarea aria-label="Campaign message" rows={10} value={message} onChange={e=>setMessage(e.target.value)}/></label><p className="text-xs text-[color:var(--ink-muted)]">Personalization: {"{{firstName}}"} and {"{{brand}}"}. Use your approved wording and unsubscribe instructions.</p><div className="rounded-xl bg-[color:var(--panel-hover)] p-4"><label className={field}>Writing style<select aria-label="Writing style" className={control} value={draftTone} onChange={e=>setDraftTone(e.target.value as DraftTone)}><option value="soft">Consultative</option><option value="growth">Benefits and growth</option></select></label><Button className="mt-3" type="button" variant="outline" disabled={drafting||saving} onClick={()=>void draftWithAi()}><Sparkles className="size-4"/>{drafting?"Preparing…":aiMode==="live"?"Draft with AI":"Suggest starter wording"}</Button><p className="mt-2 text-xs text-[color:var(--ink-muted)]">{aiMode==="live"?"AI writing is connected. Review the result before using it.":"Live AI writing is not connected. Starter wording and saved templates remain available; no paid AI request is made in demo mode."}</p></div><Link className="text-sm underline" href={`/creatives?brandId=${brandId}${programs.map(p=>`&program=${encodeURIComponent(p)}`).join("")}`}>Open this company’s template library</Link></>}
        {step===3&&(channel==="sms"?<div className="space-y-3 text-sm"><p>Ordinary SMS is text only. Your website/application link belongs in the message.</p><p className="text-[color:var(--ink-muted)]">You can continue without an image. Image messages (MMS) need a separate sending feature.</p></div>:<>{availableArtwork.length>0&&<label className={field}>Approved program artwork<select aria-label="Approved artwork" className={control} value="" onChange={e=>{if(e.target.value){setImageUrl(`${window.location.origin}/email-assets/abstract/${e.target.value}`);setImageAlt(`${programs.join(" / ")||"Abstract"} program artwork`);}}}><option value="">Choose existing artwork</option>{availableArtwork.map(([program,file])=><option key={file} value={file}>{program}</option>)}</select></label>}<label className={field}>Public image URL (optional)<Input aria-label="Public image URL" type="url" value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://your-website.com/campaign-image.png"/></label><label className={field}>Image description<Input aria-label="Image description" value={imageAlt} onChange={e=>setImageAlt(e.target.value)} disabled={!imageUrl}/></label><Button type="button" variant="outline" onClick={()=>{setImageUrl("");setImageAlt("");}}>Use no additional image</Button><p className="text-sm text-[color:var(--ink-muted)]">Your existing email template may already contain its artwork. Uploaded private documents are not published by this step. New AI image generation needs a connected image service and usage budget.</p></>)}
        {step===4&&<><CampaignAudienceControls source={sourceFilter} group={groupFilter} mode={mode} sources={sources} groups={groups} leads={platformAudienceCatalog(data)} brandId={brandId} disabled={saving} onSource={setSourceFilter} onGroup={setGroupFilter} onMode={setMode}/><label className="flex gap-2 text-sm"><input type="checkbox" checked={preferUnoffered} disabled={mode==="auto"} onChange={e=>setPreferUnoffered(e.target.checked)}/>Only contacts not previously offered this company (one-time campaigns)</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={mode==="auto"||preferVerified} disabled={mode==="auto"} onChange={e=>setPreferVerified(e.target.checked)}/>Require a saved valid contact check</label><p className="text-sm text-[color:var(--ink-muted)]">A saved valid check may only confirm format. It does not guarantee a working mailbox or phone. SMS marketing also needs recorded permission for this company.</p></>}
        {step===5&&<><div className="grid gap-4 sm:grid-cols-2"><label className={field}>{mode==="auto"?"Contacts per scheduled day":"Requested recipients"}<Input aria-label="Requested recipients" type="number" min={1} max={20000} value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label><label className={field}>Maximum sends per hour<Input aria-label="Maximum sends per hour" type="number" min={1} max={20000} value={throttlePerHour} onChange={e=>setThrottlePerHour(Number(e.target.value))}/></label></div><label className={field}>Sending window — New York time<select aria-label="Sending window" className={control} value={sendWindowPreset} onChange={e=>setSendWindowPreset(e.target.value as SendWindowPreset)}><option value="morning">Morning: 9 a.m.–noon</option><option value="afternoon">Afternoon: 1–5 p.m.</option><option value="evening">Evening: 5–8 p.m.</option><option value="custom">Custom hours</option><option value="any">Any time (use carefully for manual tests)</option></select></label>{sendWindowPreset==="custom"&&<div className="grid grid-cols-2 gap-4"><label className={field}>Start<Input aria-label="Sending start" type="time" value={sendWindowStart} onChange={e=>setSendWindowStart(e.target.value)}/></label><label className={field}>End<Input aria-label="Sending end" type="time" value={sendWindowEnd} onChange={e=>setSendWindowEnd(e.target.value)}/></label></div>}<p className="text-sm text-[color:var(--ink-muted)]">{mode==="auto"?"The final step saves this draft and opens Calendar. You must choose and approve the dates there before it can run.":"Launch queues one batch. Sending is paced inside the chosen window; provider limits may reduce capacity."}</p></>}
        {step===6&&<><dl className="grid grid-cols-2 gap-3 text-sm"><dt>Company</dt><dd>{company?.name}</dd><dt>Program</dt><dd>{programs.join(" + ")||"General"}</dd><dt>Channel</dt><dd>{channel==="sms"?"Text message":"Email"}</dd><dt>Requested</dt><dd>{volume}</dd><dt>Matching now</dt><dd>{audienceCount===null?"Checking…":audienceCount}</dd><dt>Run</dt><dd>{mode==="auto"?"Calendar dates (not approved yet)":"One-time batch"}</dd><dt>Pacing</dt><dd>Up to {throttlePerHour}/hour</dd></dl><div className="rounded-xl bg-[color:var(--panel-hover)] p-4 text-sm">Review the recipient preview and application links. For a test, go Back to Audience and choose a small manual package. This step does not add test recipients automatically.</div>{audienceCount!==null&&audienceCount<volume&&<p role="status" className="text-sm">Only {audienceCount} contacts match the current filters. The campaign cannot fill the requested {volume} automatically with ineligible contacts.</p>}<label className="flex items-start gap-3 text-sm"><input type="checkbox" aria-label="I reviewed this campaign" checked={reviewedKey===reviewKey} onChange={e=>setReviewedKey(e.target.checked?reviewKey:"")}/>I reviewed the company, message, audience and sending schedule.</label><Button type="button" disabled={saving||reviewedKey!==reviewKey||(mode==="own"&&(audienceCount===null||audienceCount===0))} onClick={()=>void create("scheduled")}>{mode==="auto"?"Save draft & plan calendar dates":"Launch this one-time campaign"}</Button></>}
        {formError&&<p role="alert" className="rounded-lg border border-rose-300 p-3 text-sm text-[color:var(--ink)]">{formError}</p>}
        <div className="flex flex-wrap justify-between gap-3 border-t border-[color:var(--ink-border)] pt-4"><div className="flex gap-2"><Button type="button" variant="outline" disabled={step===0||saving} onClick={()=>{setStep(n=>n-1);setFormError("");}}>Back</Button><Button type="submit" variant="outline" disabled={saving||step===0}>{saving?"Saving…":"Save draft"}</Button></div>{step<6&&<Button type="button" disabled={saving} onClick={()=>{if(validateStep(step))setStep(n=>n+1);}}>Next</Button>}</div>
      </form>
      <aside className={`${pane} space-y-4 xl:sticky xl:top-4`}><h2 className="font-[family-name:var(--font-display)] text-xl">Recipient preview</h2><p className="text-xs text-[color:var(--ink-muted)]">Sample name: Alex. The message is personalized for each actual recipient.</p>{channel==="email"?<><p className="break-words text-sm"><strong>Subject:</strong> {applyEmailTokens(subject,{firstName:"Alex",brand:company?.shortName||"Your company"})||"Add a subject"}</p><iframe title="Email recipient preview" sandbox="" srcDoc={preview.html} className="h-[28rem] w-full rounded-lg border border-[color:var(--ink-border)] bg-white"/></>:<><div className="whitespace-pre-wrap break-words rounded-xl bg-[color:var(--panel-hover)] p-4 text-sm">{preview.text}</div><p className="text-xs text-[color:var(--ink-muted)]">{smsSegmentCount(preview.text)} estimated SMS segment(s). Personalization can change the final length.</p></>}<div className="border-t border-[color:var(--ink-border)] pt-3"><p className="text-sm"><strong>{audienceCount===null?"Checking audience…":`${Math.min(volume||0,audienceCount)} matching contacts, up to the requested quantity`}</strong></p><p className="mt-2 text-xs text-[color:var(--ink-muted)]">This is a filter preview. Launch also applies duplicate-message cooldowns, reservations, opt-outs and provider limits.</p></div><Link href={`/setup?entity=${brandId}`} className="text-sm underline">Check this company’s connections</Link></aside>
    </div>
  </div>;
}
export default function NewCampaignPage(){return <Suspense fallback={<LoadingPanel/>}><CampaignBuilderInner/></Suspense>;}

