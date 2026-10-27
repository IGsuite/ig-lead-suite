"use client";

import Link from "next/link";
import { platformSourceOptions, platformAudienceCatalog } from "@/lib/manual-packages";
import { ProgramSelect } from "@/components/program-select";
import { Suspense, useEffect, useMemo, useState } from "react";
import { campaignStatusFilters, type CampaignStatusFilter, type CampaignListStatus } from "@/lib/campaign-status-filters";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { CampaignDelivery } from "@/components/campaign-delivery";
import type { DeliveryCounts } from "@/lib/delivery-summary";
import { DraftAudience } from "@/components/draft-audience";
import { calendarOnly } from "@/lib/calendar-audience-client";
import { AUDIENCE_NOT_SELECTED } from "@/lib/audience-filters";
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
  const { data, loading, error, refresh } = usePlatform({ omitLeads: true });
  const searchParams = useSearchParams();
  const initialChannel = searchParams.get("channel");
  const [channel, setChannel] = useState<CampaignChannel>(
    initialChannel === "email" ? "email" : "sms",
  );
  const [entityId, setEntityId] = useState(
    searchParams.get("brandId") || searchParams.get("entity") || "abstract",
  );

  const [programs,setPrograms] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>("all");
  const [delivery, setDelivery] = useState<Record<string,DeliveryCounts>>({});
  const [statuses, setStatuses] = useState<Record<string, CampaignListStatus> | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const controller = new AbortController();
    let inFlight = false;
    async function loadStatuses() {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/api/campaigns/overview", { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error("Campaign statuses could not be refreshed");
        const result = await res.json() as { statuses: Record<string, CampaignListStatus>; delivery?:Record<string,DeliveryCounts> };
        if (!controller.signal.aborted) { setStatuses(result.statuses); setDelivery(result.delivery||{}); setStatusError(null); }
      } catch (err) {
        if (!controller.signal.aborted) setStatusError(err instanceof Error ? err.message : "Status refresh failed");
      } finally { inFlight = false; }
    }
    void loadStatuses();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void loadStatuses(); }, 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [data]);
  const matchingCampaigns = useMemo(() => {
    if (!data) return [];
    return data.campaigns.filter(
      (c) => c.brandId === entityId && c.channel === channel && (!programs.length || programs.some(p=>c.programs?.includes(p))),
    );
  }, [data, entityId, channel, programs]);
  const campaigns = matchingCampaigns.filter(c => statusFilter === "all" || statuses?.[c.id]?.group === statusFilter);
  const statusCounts = Object.fromEntries(campaignStatusFilters.map(status => [status, status === "all" ? matchingCampaigns.length : matchingCampaigns.filter(c => statuses?.[c.id]?.group === status).length]));

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
        deferredReason?: string;
        windowLabel?: string;
        channel?: string;
        emptyAudience?: boolean;
        eligibleCount?: number;
      };
      if (!res.ok) throw new Error(json.error || "Could not launch campaign");
      if (json.deferred && json.deferredReason !== "outside_send_window") {
        toast.message(`Campaign is ${json.deferredReason || "already being processed"}.`);
      } else if (json.deferred) {
        toast.message(
          `Outside send window (${json.windowLabel || "window"}). Campaign scheduled for automatic processing during the window.`,
        );
      } else if (json.emptyAudience) {
        toast.error(
          "No eligible leads matched this campaign (source/group filters, verified-only, or “not yet offered this entity”). Widen filters or uncheck Prefer unoffered, then launch again.",
        );
      } else {
        const n = json.eligibleCount;
        const countLabel = typeof n === "number" ? `${n} lead(s) ` : "";
        toast.success(
          json.channel === "email"
            ? `Queued ${countLabel}for email processing`
            : `Queued ${countLabel}for SMS processing`,
        );
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Launch failed");
    }
  }

  async function cancelCampaign(id: string) {
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not cancel campaign");
      toast.success("Campaign cancelled — no further sends");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;
  if (!statuses) return statusError ? <ErrorPanel message={statusError} onRetry={refresh} /> : <LoadingPanel />;

  const brand = data.brands.find((b) => b.id === entityId);
  const channelLabel = channel === "sms" ? "SMS" : "Email";

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Pick a company and channel, then choose Pool or selected lists. Run one batch, or use approved calendar dates for automatic daily batches. Email and text stay separate."
        actions={
          <>
          <Link className={cn(buttonVariants({variant:"outline"}))} href={`/campaigns/calendar?brandId=${entityId}`}>Marketing calendar</Link>
          <Link
            href={`/campaigns/new?brandId=${entityId}&channel=${channel}`}
            className={cn(buttonVariants())}
          >
            Build {channelLabel} campaign for {brand?.shortName || "entity"}
          </Link>
          </>
        }
      />

      <div className="mb-4 max-w-xl"><ProgramSelect brand={brand} value={programs} onChange={setPrograms} label="Program folders — select one or more" /><p className="text-xs text-[color:var(--ink-muted)]">No selection shows all programs.</p></div>
      <div className="mb-4 flex flex-wrap gap-3 text-sm animate-rise">
        <div className="rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] px-3 py-2">
          <span className="font-medium">Automatic — calendar</span>
          <span className="text-[color:var(--ink-muted)]">
            {" "}
            — Each approved date draws its own quantity from the saved pool or lists.
          </span>
        </div>
        <div className="rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] px-3 py-2">
          <span className="font-medium">One-time batch</span>
          <span className="text-[color:var(--ink-muted)]">
            {" "}
            — Launch one batch from the saved audience. Opt-outs and cooldowns apply.
          </span>
        </div>
      </div>

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

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Campaign status filters">
        {campaignStatusFilters.map(status => <Button key={status} type="button" size="sm" variant={statusFilter === status ? "default" : "outline"} aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>
          {status.charAt(0).toUpperCase()+status.slice(1)} ({statusCounts[status]})
        </Button>)}
        <Button type="button" size="sm" variant="ghost" onClick={() => void refresh()}>Refresh</Button>
      </div>
      <p className="mb-4 text-xs text-[color:var(--ink-muted)]">Active = sending now · Pending = scheduled · Inactive = draft or paused. Statuses update every 30 seconds.</p>
      {statusError ? <p role="alert" className="mb-4 text-sm text-amber-800">{statusError}. Showing the last successful status check; use Refresh to retry.</p> : null}

      <div className="mb-6 max-w-sm space-y-2 animate-rise">
        <label className="text-sm font-medium">Entity portal</label>
        <Select
          value={entityId}
          onValueChange={(value) => {
            if (value) setEntityId(value);setPrograms([]);
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
        matchingCampaigns.length > 0 ? <EmptyPanel title={`No ${statusFilter} ${channelLabel} campaigns`} description="Choose All or another status to see the other campaigns in this portal." action={<Button variant="outline" onClick={()=>setStatusFilter("all")}>Show all statuses</Button>} /> :
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
                <TableHead>Mode</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>
                    <div className="font-medium">{campaign.name}{campaign.programs?.length ? <span className="mt-1 block text-xs text-[color:var(--ink-muted)]">{campaign.programs.join(" · ")}</span>:null}</div>
                    <div className="text-xs text-[color:var(--ink-muted)]">
                      {relativeDay(campaign.createdAt)} · throttle{" "}
                      {campaign.throttlePerHour}/hr · {brand?.shortName} ·{" "}
                      {campaign.sendWindowPreset || "any"}
                      {campaign.sendWindowStart && campaign.sendWindowEnd
                        ? ` ${campaign.sendWindowStart}–${campaign.sendWindowEnd}`
                        : ""}
                    </div>
                    <div className="mt-1 select-all break-all text-[10px] text-[color:var(--ink-muted)]">
                      Campaign ID: {campaign.id}
                    </div>
                    {campaign.status === "draft" && !campaign.id.startsWith("camp-calendar-") ? <DraftAudience key={[campaign.id,campaign.sourceFilter,campaign.groupFilter,campaign.mode].join("|")} campaign={campaign} sources={platformSourceOptions(data)} leads={platformAudienceCatalog(data)} groups={data.leadSummary?.groups || [...new Set(data.leads.map(l=>l.groupName))].sort()} onSaved={refresh} />:null}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        campaign.mode === "auto"
                          ? "rounded-md bg-[color:var(--accent-soft)]/60 px-2 py-0.5 text-xs font-medium"
                          : "rounded-md border border-[color:var(--ink-border)] px-2 py-0.5 text-xs font-medium"
                      }
                    >
                      {campaign.mode === "auto" ? "Calendar auto" : "One-time"}
                    </span>
                  </TableCell>
                  <TableCell>
                    Provider accepted {compactNumber(campaign.sentCount)} /{" "}
                    {compactNumber(campaign.volume)}
                    <div className="text-xs text-[color:var(--ink-muted)]">
                      {compactNumber(campaign.replyCount)} replies ·{" "}
                      {compactNumber(campaign.optOutCount)} opt-outs
                    </div>
                    <CampaignDelivery id={campaign.id} counts={delivery[campaign.id]}/>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={statuses[campaign.id]?.status || campaign.status} />
                    {campaign.status==="completed"?<p className="mt-1 text-xs text-[color:var(--ink-muted)]">Processing finished — review delivery results</p>:null}
                    {statuses[campaign.id]?.detail ? <p className="mt-1 max-w-56 text-xs text-[color:var(--ink-muted)]">{statuses[campaign.id].detail}</p> : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {campaign.status==="draft"&&!calendarOnly(campaign)&&<Link href={`/campaigns/new?brandId=${campaign.brandId}&channel=${campaign.channel}&campaignId=${campaign.id}`} className={buttonVariants({size:"sm",variant:"outline"})}>Edit draft</Link>}
                      {calendarOnly(campaign) ? <Link href={`/campaigns/calendar?brandId=${campaign.brandId}&campaignId=${campaign.id}`} className={buttonVariants({size:"sm",variant:"outline"})}>View calendar</Link> : campaign.status === "draft" ||
                      campaign.status === "scheduled" ? (
                        <Button size="sm" disabled={campaign.sourceFilter === AUDIENCE_NOT_SELECTED} onClick={() => launch(campaign.id)}>
                          Launch
                        </Button>
                      ) : null}
                      {campaign.status !== "completed" &&
                      campaign.status !== "cancelled" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void cancelCampaign(campaign.id)}
                        >
                          Cancel
                        </Button>
                      ) : null}
                      {campaign.status !== "draft" &&
                      campaign.status !== "scheduled" ? (
                        <Link
                          href={`/inbox?entity=${campaign.brandId}&channel=${campaign.channel}`}
                          className={cn(
                            buttonVariants({ size: "sm", variant: "ghost" }),
                          )}
                        >
                          Inbox
                        </Link>
                      ) : null}
                    </div>
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
