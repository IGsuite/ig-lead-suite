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
import { compactNumber } from "@/lib/client-format";
import type { CampaignChannel } from "@/lib/types";
import { cn } from "@/lib/utils";

function CampaignBuilderInner() {
  const { data, loading, error, refresh } = usePlatform();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [brandId, setBrandId] = useState(
    searchParams.get("brandId") || "abstract",
  );
  const [name, setName] = useState("Abstract — MCA working capital SMS");
  const [channel, setChannel] = useState<CampaignChannel>("sms");
  const [subject, setSubject] = useState("Working capital options from {{brand}}");
  const [message, setMessage] = useState(
    "Hi {{firstName}}, {{brand}} here — working capital may be available for your business. Reply YES for options, or STOP to opt out.",
  );
  const [sourceFilter, setSourceFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [preferUnoffered, setPreferUnoffered] = useState(true);
  const [preferVerified, setPreferVerified] = useState(true);
  const [volume, setVolume] = useState(1500);
  const [throttlePerHour, setThrottlePerHour] = useState(120);
  const [saving, setSaving] = useState(false);

  const sources = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.leads.map((l) => l.source))).sort();
  }, [data]);

  const groups = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.leads.map((l) => l.groupName))).sort();
  }, [data]);

  const audienceCount = useMemo(() => {
    if (!data) return 0;
    return data.leads.filter((lead) => {
      if (lead.optedOut || lead.status === "opted_out") return false;
      if (lead.status === "converted" || lead.convertedEntityId) return false;
      if (sourceFilter !== "all" && lead.source !== sourceFilter) return false;
      if (groupFilter !== "all" && lead.groupName !== groupFilter) return false;
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
    sourceFilter,
    groupFilter,
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
          sourceFilter,
          groupFilter,
          preferUnoffered,
          preferVerified,
          volume,
          throttlePerHour,
          status,
        }),
      });
      if (!res.ok) throw new Error("Could not create campaign");
      const campaign = (await res.json()) as { id: string };
      if (status === "scheduled") {
        await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "launch", id: campaign.id }),
        });
        toast.success("Campaign created and launched (mock throttled send)");
      } else {
        toast.success("Draft campaign saved");
      }
      await refresh();
      router.push("/campaigns");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  return (
    <div>
      <PageHeader
        title="Campaign builder"
        description="This campaign belongs to one entity only. Audience comes from the shared pool, but the offer, domain, and tracking stay locked to that portal."
        actions={
          <Link
            href={`/campaigns?brandId=${brandId}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Back to {data?.brands.find((b) => b.id === brandId)?.shortName || "campaigns"}
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
                onValueChange={(value) => setChannel(value as CampaignChannel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Campaign name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Audience source</Label>
              <Select
                value={sourceFilter}
                onValueChange={(value) => {
                  if (value) setSourceFilter(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {sources.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Audience group</Label>
              <Select
                value={groupFilter}
                onValueChange={(value) => {
                  if (value) setGroupFilter(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All groups</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={preferUnoffered}
              onChange={(e) => setPreferUnoffered(e.target.checked)}
            />
            Prefer leads not yet offered this entity (rotation)
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
