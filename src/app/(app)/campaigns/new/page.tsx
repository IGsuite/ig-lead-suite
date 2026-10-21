"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
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
  audienceContactKey,
  serializeAudienceFilter,
  toggleAudienceValue,
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
  const [programs, setPrograms] = useState<string[]>(searchParams.getAll("program"));
  const [mode, setMode] = useState<CampaignPoolMode>("own");
  const [name, setName] = useState(
    initialChannel === "email"
      ? "Abstract — working capital email"
      : "Abstract — MCA working capital SMS",
  );
  const [subject, setSubject] = useState("Working capital options from {{brand}}");
  const [message, setMessage] = useState(
    initialChannel === "email"
      ? "Hi {{firstName}},\n\n{{brand}} here — working capital may be available for your business. Reply if you want options.\n\nUnsubscribe anytime."
      : "Hi {{firstName}}, {{brand}} here — working capital may be available for your business. Reply YES for options, or STOP to opt out.",
  );
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
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
    return Array.from(new Set(data.leads.map((l) => l.source))).sort();
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
    return Array.from(new Set(data.leads.map((l) => l.groupName))).sort();
  }, [data]);

  const audienceCount = useMemo(() => {
    if (!data) return 0;
    return new Set(data.leads.filter((lead) => {
      if (lead.optedOut || lead.status === "opted_out") return false;
      if (lead.status === "converted" || lead.convertedEntityId) return false;
      if (
        selectedSources.length > 0 &&
        !selectedSources.includes(lead.source)
      )
        return false;
      if (
        selectedGroups.length > 0 &&
        !selectedGroups.includes(lead.groupName)
      )
        return false;
      if (channel === "sms" && !lead.phone) return false;
      if (channel === "email" && !lead.email) return false;
      if (preferUnoffered && lead.offeredEntityIds.includes(brandId)) return false;
      if (preferVerified) {
        if (channel === "email") {
          if (
            lead.emailStatus !== "valid" &&
            lead.emailStatus !== "risky"
          )
            return false;
        } else if (
          lead.phoneStatus !== "valid" &&
          lead.phoneStatus !== "risky"
        ) {
          return false;
        }
      }
      return true;
    }).map(lead=>audienceContactKey(lead,channel))).size;
  }, [
    data,
    selectedSources,
    selectedGroups,
    channel,
    preferUnoffered,
    preferVerified,
    brandId,
  ]);

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
          sourceFilter: serializeAudienceFilter(selectedSources),
          groupFilter: serializeAudienceFilter(selectedGroups),
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

  function changePrograms(next: string[], nextChannel=channel) {
    setPrograms(next);setTemplateId("");setImageUrl("");setImageAlt("");
    const draft=programDraft(next,nextChannel);setSubject(draft.subject);setMessage(draft.message);
    setName(`${data?.brands.find(b=>b.id===brandId)?.shortName || "Company"} — ${next.join(" + ") || "General"} — ${nextChannel}`);
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
                  if (value) {setBrandId(value);changePrograms([]);setName(`${data.brands.find(b=>b.id===value)?.shortName || "Company"} — General — ${channel}`);}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Audience sources</Label>
              <p className="text-xs text-[color:var(--ink-muted)]">
                Pick one or more. Leave all unchecked = every source.
              </p>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel-hover)] px-3 py-2">
                {sources.length === 0 ? (
                  <p className="text-xs text-[color:var(--ink-muted)]">
                    No sources in the pool yet.
                  </p>
                ) : (
                  sources.map((source) => (
                    <label
                      key={source}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSources.includes(source)}
                        onChange={(e) =>
                          setSelectedSources((prev) =>
                            toggleAudienceValue(prev, source, e.target.checked),
                          )
                        }
                      />
                      <span>{source}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Audience groups</Label>
              <p className="text-xs text-[color:var(--ink-muted)]">
                Pick one or more. Leave all unchecked = every group.
              </p>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel-hover)] px-3 py-2">
                {groups.length === 0 ? (
                  <p className="text-xs text-[color:var(--ink-muted)]">
                    No groups in the pool yet.
                  </p>
                ) : (
                  groups.map((group) => (
                    <label
                      key={group}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedGroups.includes(group)}
                        onChange={(e) =>
                          setSelectedGroups((prev) =>
                            toggleAudienceValue(prev, group, e.target.checked),
                          )
                        }
                      />
                      <span>{group}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
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
                      Growth (working capital options)
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
              Uses OpenAI when <code className="text-[0.7rem]">OPENAI_API_KEY</code>{" "}
              is set; otherwise a financing-safe demo draft. Ads still use Gemini.
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

          <div className="space-y-2">
            <Label>Campaign mode</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "own" ? "default" : "outline"}
                onClick={() => setMode("own")}
              >
                Own campaign
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "auto" ? "default" : "outline"}
                onClick={() => setMode("auto")}
              >
                Auto wheel
              </Button>
            </div>
            <p className="text-xs text-[color:var(--ink-muted)]">
              {mode === "own"
                ? "Standalone blast for this entity — outside daily Autopilot volumes. Still respects global opt-outs and same-message cooldowns."
                : "Marks this campaign as an Auto wheel leg (fair pool cursor + channel cooldown). Prefer Autopilot page for daily volumes."}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={preferUnoffered}
              onChange={(e) => setPreferUnoffered(e.target.checked)}
              disabled={mode === "auto"}
            />
            Prefer leads not yet offered this entity (Own mode)
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={preferVerified}
              onChange={(e) => setPreferVerified(e.target.checked)}
            />
            Only queue verified (valid/risky) contacts — skip invalids to cut bounces
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Volume</Label>
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
            <Button type="submit" variant="outline" disabled={saving}>
              Save draft
            </Button>
            <Button
              type="button"
              disabled={saving || audienceCount === 0}
              onClick={() => void create("scheduled")}
              title={
                audienceCount === 0
                  ? "No eligible leads — widen source/group filters or uncheck Prefer unoffered"
                  : undefined
              }
            >
              Launch now
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
            {compactNumber(Math.min(volume, audienceCount))}
          </p>
          <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
            contacts selected from {compactNumber(audienceCount)} eligible shared-pool
            leads
            {preferUnoffered ? " · fresh for this entity" : ""}
            {preferVerified ? " · verified only" : ""}.
          </p>
          <div className="mt-6 space-y-3 text-sm text-[color:var(--ink-soft)]">
            <div className="rounded-xl bg-[color:var(--panel-hover)] px-3 py-2">
              Estimated hours at throttle:{" "}
              <strong>
                {Math.max(1, Math.ceil(Math.min(volume, audienceCount) / throttlePerHour))}
              </strong>
            </div>
            <div className="rounded-xl bg-[color:var(--accent-soft)]/60 px-3 py-2">
              Same lead can later get a different entity’s offer — Abstract,
              Ahava, Take More, Venture, or TYH Marketing.
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
