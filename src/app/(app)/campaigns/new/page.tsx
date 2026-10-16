"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
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
  toggleAudienceValue,
} from "@/lib/audience-filters";
import { compactNumber } from "@/lib/client-format";
import type {
  CampaignChannel,
  CampaignPoolMode,
  SendWindowPreset,
} from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [preferUnoffered, setPreferUnoffered] = useState(true);
  const [preferVerified, setPreferVerified] = useState(true);
  const [volume, setVolume] = useState(1500);
  const [throttlePerHour, setThrottlePerHour] = useState(120);
  const [sendWindowPreset, setSendWindowPreset] =
    useState<SendWindowPreset>("morning");
  const [sendWindowStart, setSendWindowStart] = useState("09:00");
  const [sendWindowEnd, setSendWindowEnd] = useState("12:00");
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState("");

  const sources = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.leads.map((l) => l.source))).sort();
  }, [data]);

  const usableTemplates = useMemo(() => {
    if (!data) return [];
    return (data.messageTemplates || []).filter(
      (t) =>
        t.channel === channel &&
        (t.brandId === null || t.brandId === brandId),
    );
  }, [data, channel, brandId]);

  const groups = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.leads.map((l) => l.groupName))).sort();
  }, [data]);

  const audienceCount = useMemo(() => {
    if (!data) return 0;
    return data.leads.filter((lead) => {
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
    }).length;
  }, [
    data,
    selectedSources,
    selectedGroups,
    channel,
    preferUnoffered,
    preferVerified,
    brandId,
  ]);

  async function create(status: "draft" | "scheduled") {
    setSaving(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          name,
          channel,
          subject: channel === "email" ? subject : undefined,
          message,
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
          status,
        }),
      });
      if (!res.ok) throw new Error("Could not create campaign");
      const campaign = (await res.json()) as { id: string };
      if (status === "scheduled") {
        const launchRes = await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "launch", id: campaign.id }),
        });
        const launched = (await launchRes.json()) as {
          deferred?: boolean;
          windowLabel?: string;
        };
        if (launched.deferred) {
          toast.message(
            `Scheduled — outside send window (${launched.windowLabel || "window"}). Launch again during the window.`,
          );
        } else {
          toast.success(
            "Campaign launched through IG Lead Suite → Telnyx / Smartlead",
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
                  if (value) setBrandId(value);
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
                  setTemplateId("");
                  if (next === "email" && name.toLowerCase().includes("sms")) {
                    setName(name.replace(/SMS/i, "email"));
                  }
                  if (next === "sms" && name.toLowerCase().includes("email")) {
                    setName(name.replace(/email/i, "SMS"));
                  }
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
                setMessage(tpl.body);
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
                ? "Shared + this company's Ads templates for the selected channel."
                : "No matching templates — create some under Ads."}{" "}
              <Link href="/creatives" className="underline underline-offset-2">
                Open Ads
              </Link>
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
            </p>
          </div>

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
                Outside the window, launch stays <strong>scheduled</strong> until
                you run it again in-hours.
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={saving}>
              Save draft
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void create("scheduled")}
            >
              Launch now
            </Button>
          </div>
        </form>

        <aside className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-1">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            Audience preview
          </h2>
          <p className="mt-3 text-4xl font-[family-name:var(--font-display)] tracking-tight">
            {compactNumber(Math.min(volume, audienceCount))}
          </p>
          <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
            contacts queued from {compactNumber(audienceCount)} eligible shared-pool
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
