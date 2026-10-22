"use client";

import Link from "next/link";
import { platformSourceOptions, platformAudienceCatalog } from "@/lib/manual-packages";
import { CampaignAudienceControls } from "@/components/campaign-audience-controls";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, useEffect } from "react";
import { ProgramSelect } from "@/components/program-select";
import { programTemplateMatches, programDraft } from "@/lib/programs";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePlatform } from "@/hooks/use-platform";
import {
  serializeAudienceFilter,
  AUDIENCE_NOT_SELECTED,
} from "@/lib/audience-filters";
import { compactNumber } from "@/lib/client-format";
import type {
  CampaignChannel,
  CampaignPoolMode,
  SendWindowPreset,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type DraftTone = "soft" | "growth";

function CampaignBuilderInner() {
  const { data, loading, error, refresh } = usePlatform();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [volume, setVolume] = useState(1500);
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
    setSaving(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      const campaign = (await res.json()) as { id: string };
      if (mode === "auto") {
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
      await refresh();
      router.push(`/campaigns?brandId=${brandId}&channel=${channel}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  function changePrograms(next: string[], nextChannel=channel, nextBrandId=brandId) {
    setPrograms(next);setTemplateId("");setImageUrl("");setImageAlt("");
    const draft=programDraft(next,nextChannel,{id:nextBrandId});setSubject(draft.subject);setMessage(draft.message);
    setName(`${data?.brands.find(b=>b.id===nextBrandId)?.shortName || "Company"} — ${next.join(" + ") || "General"} — ${nextChannel}`);
  }

  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  const channelLabel = channel === "sms" ? "SMS" : "Email";

  return (
    <div>
      <PageHeader
        title={`${channelLabel} campaign builder`}
        description={`Building an ${channelLabel} campaign for one entity only. Audience comes from the shared pool, but the offer, domain, and tracking stay locked to that portal — never mixed with the other channel.`}
        actions={
          <Link
            href={`/campaigns?brandId=${brandId}&channel=${channel}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Back to {data?.brands.find((b) => b.id === brandId)?.shortName || "campaigns"} {channelLabel}
          </Link>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <form
          className="space-y-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise"
          onSubmit={(e) => {
            e.preventDefault();
            void create("draft");
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Entity portal</Label>
              <Select
                value={brandId}
                onValueChange={(value) => {
                  if (value) {setBrandId(value);changePrograms([],channel,value);}
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.shortName} — {brand.focus}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select
                value={channel}
                onValueChange={(value) => {
                  if (!value) return;
                  const next = value as CampaignChannel;
                  setChannel(next);
                  changePrograms(programs,next);
                  setTemplateId("");

                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS (Telnyx)</SelectItem>
                  <SelectItem value="email">Email (Smartlead / Instantly)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-[color:var(--ink-muted)]">
                Channel is locked for this campaign after save — SMS and email lists stay separate.
              </p>
            </div>
          </div>

          <ProgramSelect brand={data.brands.find(b=>b.id===brandId)} value={programs} onChange={changePrograms} />
          <div className="space-y-2">
            <Label>Campaign name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <CampaignAudienceControls source={sourceFilter} group={groupFilter} mode={mode} sources={sources} groups={groups} leads={platformAudienceCatalog(data)} brandId={brandId} disabled={saving} onSource={setSourceFilter} onGroup={setGroupFilter} onMode={setMode} />

          <div className="space-y-2">
            <p className="text-xs text-[color:var(--ink-muted)]">Verification checks contact format. It does not prove mailbox ownership or guarantee delivery. Texts also require direct permission for this company.</p>
            <Label>Use template</Label>
            <Select
              value={templateId || "__none__"}
              onValueChange={(value) => {
                if (!value || value === "__none__") {
                  setTemplateId("");
                  return;
                }
                const tpl = usableTemplates.find((t) => t.id === value);
                if (!tpl) return;
                setTemplateId(tpl.id);
                setMessage(tpl.body);setImageUrl("");setImageAlt("");
                if (tpl.channel === "email" && tpl.subject) {
                  setSubject(tpl.subject);
                }
                toast.message(`Loaded “${tpl.name}” from Ads`);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick from Ads library" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Write from scratch</SelectItem>
                {usableTemplates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name}
                    {tpl.brandId ? "" : " · shared"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[color:var(--ink-muted)]">
              {usableTemplates.length
                ? "Templates tagged to your selected programs and channel."
                : "No matching templates — create some under Ads."}{" "}
              <Link href={`/creatives?brandId=${brandId}${programs.map(p=>`&program=${encodeURIComponent(p)}`).join("")}`} className="underline underline-offset-2">
                Open Ads
              </Link>
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-2 min-w-[10rem]">
                <Label>AI tone</Label>
                <Select
                  value={draftTone}
                  onValueChange={(value) =>
                    setDraftTone(value === "growth" ? "growth" : "soft")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soft">Soft (consultative)</SelectItem>
                    <SelectItem value="growth">
                      Growth / benefits
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={drafting || saving}
                onClick={() => void draftWithAi()}
              >
                <Sparkles className="size-3.5" />
                {drafting ? "Drafting…" : "Draft with AI"}
              </Button>
            </div>
            <p className="text-xs text-[color:var(--ink-muted)]">
              Creates a draft for this company’s programs or services. Review the wording before saving or sending.
            </p>
          </div>

          {channel === "email" ? (
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-36"
              required
            />
            <p className="text-xs text-[color:var(--ink-muted)]">
              Tokens: {"{{firstName}}"}, {"{{brand}}"}. STOP / unsubscribe handled
              globally.
              {channel === "email"
                ? " Plain text is the fallback; HTML is generated for richer inboxes."
                : ""}
            </p>
          </div>

          {channel === "email" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Image URL (optional)</Label>
                <Input
                  type="url"
                  placeholder="https://…/hero.png"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
                <p className="text-xs text-[color:var(--ink-muted)]">
                  Public https URL embedded in the HTML email only — not in the
                  plain-text fallback. Later, Ads library creatives can supply
                  this URL; for now paste any hosted image.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Image alt text</Label>
                <Input
                  placeholder="Offer graphic"
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  disabled={!imageUrl.trim()}
                />
              </div>
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={preferUnoffered}
              onChange={(e) => setPreferUnoffered(e.target.checked)}
              disabled={mode === "auto"}
            />
            Prefer leads not yet offered this company (one-time batches)
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mode === "auto" || preferVerified}
              disabled={mode === "auto"}
              onChange={(e) => setPreferVerified(e.target.checked)}
            />
            Only queue contacts with a saved valid check for this channel (skip risky, invalid and unverified)
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{mode === "auto" ? "Default contacts per scheduled day" : "Batch volume"}</Label>
              <Input
                type="number"
                min={1}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label>Throttle (per hour)</Label>
              <Input
                type="number"
                min={1}
                value={throttlePerHour}
                onChange={(e) => setThrottlePerHour(Number(e.target.value) || 1)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Send window (America/New_York)</Label>
              <Select
                value={sendWindowPreset}
                onValueChange={(value) => {
                  if (value) setSendWindowPreset(value as SendWindowPreset);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning (9am–12pm)</SelectItem>
                  <SelectItem value="afternoon">Afternoon (1pm–5pm)</SelectItem>
                  <SelectItem value="evening">Evening (5pm–8pm)</SelectItem>
                  <SelectItem value="custom">Custom hours</SelectItem>
                  <SelectItem value="any">Any time</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-[color:var(--ink-muted)]">
                Sends only fire inside this window (email + SMS). Different
                campaigns can use different windows.
              </p>
            </div>
            {sendWindowPreset === "custom" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start</Label>
                  <Input
                    type="time"
                    value={sendWindowStart}
                    onChange={(e) => setSendWindowStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End</Label>
                  <Input
                    type="time"
                    value={sendWindowEnd}
                    onChange={(e) => setSendWindowEnd(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-[color:var(--panel-hover)] px-3 py-2 text-sm text-[color:var(--ink-soft)] self-end">
                Outside the window, a launched campaign stays <strong>scheduled</strong> and
                starts automatically during its sending window. Saved drafts do not send.
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={saving || sourceFilter === AUDIENCE_NOT_SELECTED}>
              Save draft
            </Button>
            <Button
              type="button"
              disabled={saving || sourceFilter === AUDIENCE_NOT_SELECTED || (mode === "own" && audienceCount === 0)}
              onClick={() => void create("scheduled")}
              title={
                audienceCount === 0
                  ? "No eligible leads — widen source/group filters or uncheck Prefer unoffered"
                  : undefined
              }
            >
              {mode === "auto" ? "Save & plan dates" : "Launch one-time batch"}
            </Button>
          </div>
          {audienceCount === 0 ? (
            <p className="text-sm text-[color:var(--danger,#b91c1c)]">
              Audience is empty with current filters. Common cause for a retest:
              the lead was already offered this entity — uncheck “Prefer leads not
              yet offered this entity”.
            </p>
          ) : null}
        </form>

        <aside className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-1">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            Audience preview
          </h2>
          <p className="mt-3 text-4xl font-[family-name:var(--font-display)] tracking-tight">
            {audienceCount===null?"Checking…":compactNumber(Math.min(volume, audienceCount))}
          </p>
          <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
            contacts selected from {audienceCount===null?"Checking…":compactNumber(audienceCount)} eligible shared-pool
            leads
            {mode === "own" && preferUnoffered ? " · fresh for this entity" : ""}
            {mode === "auto" || preferVerified ? " · saved valid checks only" : ""}.
          </p>
          <div className="mt-6 space-y-3 text-sm text-[color:var(--ink-soft)]">
            <div className="rounded-xl bg-[color:var(--panel-hover)] px-3 py-2">
              Estimated hours at throttle:{" "}
              <strong>
                {audienceCount===null?"Checking…":Math.max(1, Math.ceil(Math.min(volume, audienceCount) / throttlePerHour))}
              </strong>
            </div>
            <div className="rounded-xl bg-[color:var(--accent-soft)]/60 px-3 py-2">
              A lead may be eligible for another company’s campaign later, subject to that channel’s eligibility and permission requirements.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <CampaignBuilderInner />
    </Suspense>
  );
}
