"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlatform } from "@/hooks/use-platform";
import { compactNumber, relativeDay } from "@/lib/client-format";
import type { CampaignChannel } from "@/lib/types";
import { cn } from "@/lib/utils";

function CampaignsInner() {
  const { data, loading, error, refresh } = usePlatform();
  const searchParams = useSearchParams();
  const initialChannel = searchParams.get("channel");
  const [channel, setChannel] = useState<CampaignChannel>(
    initialChannel === "email" ? "email" : "sms",
  );
  const [entityId, setEntityId] = useState(
    searchParams.get("brandId") || searchParams.get("entity") || "abstract",
  );

  const campaigns = useMemo(() => {
    if (!data) return [];
    return data.campaigns.filter(
      (c) => c.brandId === entityId && c.channel === channel,
    );
  }, [data, entityId, channel]);

  const counts = useMemo(() => {
    if (!data) return { sms: 0, email: 0 };
    const forEntity = data.campaigns.filter((c) => c.brandId === entityId);
    return {
      sms: forEntity.filter((c) => c.channel === "sms").length,
      email: forEntity.filter((c) => c.channel === "email").length,
    };
  }, [data, entityId]);

  async function launch(id: string) {
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "launch", id }),
      });
      const json = (await res.json()) as {
        error?: string;
        deferred?: boolean;
        windowLabel?: string;
        channel?: string;
      };
      if (!res.ok) throw new Error(json.error || "Could not launch campaign");
      if (json.deferred) {
        toast.message(
          `Outside send window (${json.windowLabel || "window"}). Campaign scheduled — launch again during the window.`,
        );
      } else {
        toast.success(
          json.channel === "email"
            ? "Launched through Master Marketing CRM → Smartlead/Instantly"
            : "Launched through Master Marketing CRM → Telnyx SMS",
        );
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Launch failed");
    }
  }

  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  const brand = data.brands.find((b) => b.id === entityId);
  const channelLabel = channel === "sms" ? "SMS" : "Email";

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="SMS and email stay separate. Pick a channel, then an entity portal — Ahava never sends under Abstract."
        actions={
          <Link
            href={`/campaigns/new?brandId=${entityId}&channel=${channel}`}
            className={cn(buttonVariants())}
          >
            Build {channelLabel} for {brand?.shortName || "entity"}
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 animate-rise">
        <Button
          type="button"
          variant={channel === "sms" ? "default" : "outline"}
          size="sm"
          onClick={() => setChannel("sms")}
        >
          SMS campaigns
          <span className="ml-1.5 text-xs opacity-70">({counts.sms})</span>
        </Button>
        <Button
          type="button"
          variant={channel === "email" ? "default" : "outline"}
          size="sm"
          onClick={() => setChannel("email")}
        >
          Email campaigns
          <span className="ml-1.5 text-xs opacity-70">({counts.email})</span>
        </Button>
      </div>

      <div className="mb-6 max-w-sm space-y-2 animate-rise">
        <label className="text-sm font-medium">Entity portal</label>
        <Select
          value={entityId}
          onValueChange={(value) => {
            if (value) setEntityId(value);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-[color:var(--ink-muted)]">
          Showing only {brand?.name || "this entity"} {channelLabel} campaigns.
          Other brands and the other channel are hidden so nothing mixes.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <EmptyPanel
          title={`No ${brand?.shortName || "entity"} ${channelLabel} campaigns`}
          description={`Create a ${channelLabel} campaign for this portal. Audience still comes from the shared pool, but the offer and send identity stay here.`}
          action={
            <Link
              href={`/campaigns/new?brandId=${entityId}&channel=${channel}`}
              className={cn(buttonVariants())}
            >
              Build {channelLabel} campaign
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise">
          <div className="border-b border-[color:var(--ink-border)] px-5 py-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl">
              {channelLabel} · {brand?.shortName || "Entity"}
            </h2>
            <p className="text-xs text-[color:var(--ink-muted)]">
              {channel === "sms"
                ? "Telnyx SMS — texts only in this list."
                : "Smartlead / Instantly email — emails only in this list."}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>
                    <div className="font-medium">{campaign.name}</div>
                    <div className="text-xs text-[color:var(--ink-muted)]">
                      {relativeDay(campaign.createdAt)} · throttle{" "}
                      {campaign.throttlePerHour}/hr · {brand?.shortName} ·{" "}
                      {campaign.sendWindowPreset || "any"}
                      {campaign.sendWindowStart && campaign.sendWindowEnd
                        ? ` ${campaign.sendWindowStart}–${campaign.sendWindowEnd}`
                        : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    {compactNumber(campaign.sentCount)} /{" "}
                    {compactNumber(campaign.volume)}
                    <div className="text-xs text-[color:var(--ink-muted)]">
                      {compactNumber(campaign.replyCount)} replies ·{" "}
                      {compactNumber(campaign.optOutCount)} opt-outs
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={campaign.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {campaign.status === "draft" ||
                    campaign.status === "scheduled" ? (
                      <Button size="sm" onClick={() => launch(campaign.id)}>
                        Launch
                      </Button>
                    ) : (
                      <Link
                        href="/inbox"
                        className={cn(
                          buttonVariants({ size: "sm", variant: "ghost" }),
                        )}
                      >
                        Inbox
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <CampaignsInner />
    </Suspense>
  );
}
