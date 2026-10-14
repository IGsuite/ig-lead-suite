"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import {
  EntityScoreRow,
  PerformanceScorecards,
} from "@/components/performance-widgets";
import { StatusPill } from "@/components/status-pill";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/state-panels";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlatform } from "@/hooks/use-platform";
import {
  COST_CATEGORIES,
  allEntityImprovementInsights,
  allEntityPerformanceScores,
  campaignMessageResults,
  channelLabel,
  costCategoryLabel,
  entityCostRollups,
  entityImprovementInsight,
  entityPerformanceScores,
  entitySourceResults,
  filterCostEntries,
  poolSourceResults,
  timeOfDayResults,
} from "@/lib/analytics";
import { compactNumber, money } from "@/lib/client-format";
import type { CampaignChannel, ChannelFilter, CostCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

type ReportTab =
  | "performance"
  | "improve"
  | "sources"
  | "timing"
  | "costs";

function parseChannel(raw: string | null): ChannelFilter {
  if (raw === "email" || raw === "sms" || raw === "all") return raw;
  return "sms";
}

function ReportsInner() {
  const { data, loading, error, refresh } = usePlatform();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<ReportTab>(
    initialTab === "costs"
      ? "costs"
      : initialTab === "timing"
        ? "timing"
        : initialTab === "sources"
          ? "sources"
          : initialTab === "improve"
            ? "improve"
            : "performance",
  );
  const [entityId, setEntityId] = useState(
    searchParams.get("entity") || "all",
  );
  const [channel, setChannel] = useState<ChannelFilter>(
    parseChannel(searchParams.get("channel")),
  );

  const [costBrandId, setCostBrandId] = useState<string>("shared");
  const [category, setCategory] = useState<CostCategory>("sms");
  const [label, setLabel] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);

  const reportChannel: ChannelFilter =
    tab === "costs" ? "all" : channel;

  const sourceRows = useMemo(() => {
    if (!data) return [];
    if (entityId === "all") return poolSourceResults(data, reportChannel);
    return entitySourceResults(data, entityId, reportChannel);
  }, [data, entityId, reportChannel]);

  const costRollups = useMemo(
    () => (data ? entityCostRollups(data) : []),
    [data],
  );

  const costEntries = useMemo(() => {
    if (!data) return [];
    const filter =
      entityId === "all"
        ? "all"
        : entityId === "shared"
          ? "shared"
          : entityId;
    return filterCostEntries(data.costEntries || [], filter);
  }, [data, entityId]);

  const timingRows = useMemo(() => {
    if (!data) return [];
    const scope = entityId === "all" || entityId === "shared" ? "all" : entityId;
    return timeOfDayResults(data, scope, "America/New_York", reportChannel);
  }, [data, entityId, reportChannel]);

  const scores = useMemo(() => {
    if (!data) return null;
    const scope = entityId === "shared" ? "all" : entityId;
    return entityPerformanceScores(data, scope, reportChannel);
  }, [data, entityId, reportChannel]);

  const smsScores = useMemo(() => {
    if (!data) return null;
    const scope = entityId === "shared" ? "all" : entityId;
    return entityPerformanceScores(data, scope, "sms");
  }, [data, entityId]);

  const emailScores = useMemo(() => {
    if (!data) return null;
    const scope = entityId === "shared" ? "all" : entityId;
    return entityPerformanceScores(data, scope, "email");
  }, [data, entityId]);

  const entityScores = useMemo(
    () =>
      data ? allEntityPerformanceScores(data, false, reportChannel) : [],
    [data, reportChannel],
  );

  const messageRows = useMemo(() => {
    if (!data) return [];
    const scope = entityId === "all" || entityId === "shared" ? "all" : entityId;
    return campaignMessageResults(data, scope, reportChannel);
  }, [data, entityId, reportChannel]);

  const improveInsight = useMemo(() => {
    if (!data) return null;
    const scope = entityId === "all" || entityId === "shared" ? "all" : entityId;
    return entityImprovementInsight(data, scope, reportChannel);
  }, [data, entityId, reportChannel]);

  const allImprove = useMemo(
    () => (data ? allEntityImprovementInsights(data, reportChannel) : []),
    [data, reportChannel],
  );

  async function addCost(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !amount) {
      toast.error("Label and amount are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: costBrandId === "shared" ? null : costBrandId,
          category,
          label,
          vendor: vendor || undefined,
          amountDollars: Number(amount),
          incurredAt,
        }),
      });
      if (!res.ok) throw new Error("Could not save cost");
      toast.success("Cost logged");
      setLabel("");
      setVendor("");
      setAmount("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeCost(id: string) {
    try {
      const res = await fetch(`/api/costs?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Cost removed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (loading) return <LoadingPanel label="Loading reports…" />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  const brand =
    entityId === "all" || entityId === "shared"
      ? null
      : data.brands.find((b) => b.id === entityId) || null;

  const totalSpend = sourceRows.reduce((sum, row) => sum + row.costCents, 0);
  const totalReplies = sourceRows.reduce((sum, row) => sum + row.replies, 0);
  const totalConversions = sourceRows.reduce(
    (sum, row) => sum + row.conversions,
    0,
  );
  const best = sourceRows.find((r) => r.recommendation === "scale_up");

  const costTotal = costEntries.reduce((s, c) => s + c.amountCents, 0);
  const entityRollup =
    entityId === "all"
      ? null
      : costRollups.find((r) =>
          entityId === "shared" ? r.brandId === null : r.brandId === entityId,
        );

  const tabs: { id: ReportTab; label: string }[] = [
    { id: "performance", label: "Performance" },
    { id: "improve", label: "Improve" },
    { id: "sources", label: "Sources" },
    { id: "timing", label: "Send timing" },
    { id: "costs", label: "Costs & ROI" },
  ];

  const channelTabs: { id: ChannelFilter; label: string }[] = [
    { id: "sms", label: "SMS" },
    { id: "email", label: "Email" },
    { id: "all", label: "Both (compare)" },
  ];

  const showDualPerformance = tab === "performance" && channel === "all";

  return (
    <div>
      <PageHeader
        title="Reports"
        description="SMS and email scorecards stay separate — reply, interested, convert, and efficiency per channel, plus source and timing winners."
        actions={
          brand ? (
            <Link
              href={`/brands/${brand.id}`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Open {brand.shortName} portal
            </Link>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 animate-rise">
        {tabs.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant={tab === t.id ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="max-w-sm flex-1 space-y-2">
          <label className="text-sm font-medium">Report for</label>
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
              <SelectItem value="all">
                {tab === "costs" ? "All entities + shared" : "Shared pool (all)"}
              </SelectItem>
              {tab === "costs" ? (
                <SelectItem value="shared">Shared / overhead only</SelectItem>
              ) : null}
              {data.brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {tab !== "costs" ? (
          <div className="space-y-2">
            <label className="text-sm font-medium">Channel</label>
            <div className="flex flex-wrap gap-2">
              {channelTabs.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  variant={channel === c.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setChannel(c.id)}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {tab === "performance" ? (
        <div className="space-y-6">
          {showDualPerformance && smsScores && emailScores ? (
            <div className="grid gap-6 xl:grid-cols-2 animate-rise">
              <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
                <PerformanceScorecards
                  scores={smsScores}
                  title={
                    brand
                      ? `${brand.shortName} · SMS`
                      : "Pool · SMS"
                  }
                />
              </section>
              <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
                <PerformanceScorecards
                  scores={emailScores}
                  title={
                    brand
                      ? `${brand.shortName} · Email`
                      : "Pool · Email"
                  }
                />
              </section>
            </div>
          ) : scores ? (
            <div className="animate-rise">
              <div className="mb-3">
                <h2 className="font-[family-name:var(--font-display)] text-2xl">
                  {brand
                    ? `${brand.shortName} · ${channelLabel(channel)}`
                    : `Pool · ${channelLabel(channel)}`}
                </h2>
                <p className="text-sm text-[color:var(--ink-muted)]">
                  Reply rate, interested share, conversions, and cost efficiency
                  for {channelLabel(channel).toLowerCase()} only.
                </p>
              </div>
              <PerformanceScorecards scores={scores} />
            </div>
          ) : null}

          {entityId === "all" ? (
            <div className="animate-rise-delay-1">
              <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl">
                By company · {channelLabel(reportChannel)}
              </h2>
              {reportChannel === "all" ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {(["sms", "email"] as CampaignChannel[]).map((ch) => (
                    <div key={ch} className="space-y-3">
                      <h3 className="text-sm font-medium uppercase tracking-[0.08em] text-[color:var(--ink-muted)]">
                        {channelLabel(ch)}
                      </h3>
                      {allEntityPerformanceScores(data, false, ch).map(
                        (row) => (
                          <EntityScoreRow
                            key={`${ch}-${row.brandId || "all"}`}
                            scores={row}
                            onOpen={() => {
                              if (row.brandId) {
                                setEntityId(row.brandId);
                                setChannel(ch);
                              }
                            }}
                          />
                        ),
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {entityScores.map((row) => (
                    <EntityScoreRow
                      key={row.brandId || "all"}
                      scores={row}
                      onOpen={() => {
                        if (row.brandId) setEntityId(row.brandId);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise-delay-2">
            <div className="border-b border-[color:var(--ink-border)] px-5 py-4">
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                Best message / campaign copy · {channelLabel(reportChannel)}
              </h2>
              <p className="text-sm text-[color:var(--ink-muted)]">
                Ranked within {channelLabel(reportChannel).toLowerCase()} by
                interested rate, then reply rate. SMS and email copy are never
                ranked against each other.
              </p>
            </div>
            {!messageRows.some((r) => r.sent > 0 || r.replies > 0) ? (
              <div className="p-5">
                <EmptyPanel
                  title={`No ${channelLabel(reportChannel)} campaign results yet`}
                  description={`Launch ${channelLabel(reportChannel).toLowerCase()} campaigns for this entity to rank which message copy performs best.`}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Replies</TableHead>
                    <TableHead>Interested</TableHead>
                    <TableHead>Reply %</TableHead>
                    <TableHead>Interested %</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messageRows.map((row) => (
                    <TableRow key={row.campaignId}>
                      <TableCell className="font-medium">{row.rank}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-[color:var(--ink-muted)]">
                          {row.brandName} · {row.channel.toUpperCase()}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="line-clamp-2 text-sm text-[color:var(--ink-soft)]">
                          {row.subject ? `${row.subject} — ` : ""}
                          {row.message}
                        </div>
                      </TableCell>
                      <TableCell>{compactNumber(row.sent)}</TableCell>
                      <TableCell>{compactNumber(row.replies)}</TableCell>
                      <TableCell>{compactNumber(row.interested)}</TableCell>
                      <TableCell>
                        {row.replyRate != null ? `${row.replyRate}%` : "—"}
                      </TableCell>
                      <TableCell>
                        {row.interestedRate != null
                          ? `${row.interestedRate}%`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={row.recommendation} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      ) : tab === "improve" ? (
        <div className="space-y-6">
          <p className="text-sm text-[color:var(--ink-muted)] animate-rise">
            Improve recommendations scoped to{" "}
            <strong>{channelLabel(reportChannel)}</strong>.
          </p>
          {improveInsight ? (
            <div className="grid gap-4 lg:grid-cols-3 animate-rise">
              <ImproveCard
                title="Best source"
                subtitle={`Buy more for ${channelLabel(reportChannel)}`}
                primary={improveInsight.bestSource?.source || "—"}
                meta={
                  improveInsight.bestSource
                    ? `${compactNumber(improveInsight.bestSource.replies)} replies · ${
                        improveInsight.bestSource.costPerReply != null
                          ? `${money(improveInsight.bestSource.costPerReply)} / reply`
                          : "no CPA yet"
                      }`
                    : "Need replies by source"
                }
                warn={
                  improveInsight.worstSource
                    ? `Cut or pause: ${improveInsight.worstSource.source}`
                    : undefined
                }
              />
              <ImproveCard
                title="Best timing"
                subtitle={`Send ${channelLabel(reportChannel)} in this window`}
                primary={improveInsight.bestTiming?.label || "—"}
                meta={
                  improveInsight.bestTiming
                    ? `${improveInsight.bestTiming.interestedRate ?? 0}% interested · ${compactNumber(improveInsight.bestTiming.replies)} replies`
                    : "Need timed replies"
                }
              />
              <ImproveCard
                title="Best message"
                subtitle={`Reuse this ${channelLabel(reportChannel)} copy`}
                primary={improveInsight.bestMessage?.name || "—"}
                meta={
                  improveInsight.bestMessage
                    ? `${improveInsight.bestMessage.interestedRate ?? 0}% interested · ${compactNumber(improveInsight.bestMessage.replies)} replies · ${improveInsight.bestMessage.channel.toUpperCase()}`
                    : "Need campaign replies"
                }
                detail={improveInsight.bestMessage?.message}
              />
            </div>
          ) : null}

          {entityId === "all" ? (
            <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise-delay-1">
              <div className="border-b border-[color:var(--ink-border)] px-5 py-4">
                <h2 className="font-[family-name:var(--font-display)] text-2xl">
                  Improve by company · {channelLabel(reportChannel)}
                </h2>
                <p className="text-sm text-[color:var(--ink-muted)]">
                  Source, timing, and message winners side by side — one scan per
                  entity for this channel.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Reply %</TableHead>
                    <TableHead>Interested %</TableHead>
                    <TableHead>Scale source</TableHead>
                    <TableHead>Best window</TableHead>
                    <TableHead>Best copy</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allImprove.map((row) => (
                    <TableRow key={row.brandId || "pool"}>
                      <TableCell className="font-medium">
                        {row.brandName}
                      </TableCell>
                      <TableCell>
                        {row.scores.replyRate != null
                          ? `${row.scores.replyRate}%`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {row.scores.interestedRate != null
                          ? `${row.scores.interestedRate}%`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {row.bestSource?.source || "—"}
                      </TableCell>
                      <TableCell>
                        {row.bestTiming
                          ? row.bestTiming.label.replace(/ \(.*\)/, "")
                          : "—"}
                      </TableCell>
                      <TableCell className="max-w-[14rem]">
                        <div className="truncate text-sm">
                          {row.bestMessage?.name || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.brandId ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEntityId(row.brandId!)}
                          >
                            Open
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 animate-rise-delay-1">
              <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
                <h3 className="font-[family-name:var(--font-display)] text-xl">
                  Sources to act on
                </h3>
                <div className="mt-3 space-y-2">
                  {sourceRows.slice(0, 5).map((row) => (
                    <div
                      key={row.source}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--ink-border)] px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{row.source}</span>
                      <StatusPill status={row.recommendation} />
                    </div>
                  ))}
                  {!sourceRows.length ? (
                    <p className="text-sm text-[color:var(--ink-muted)]">
                      No source data yet.
                    </p>
                  ) : null}
                </div>
              </section>
              <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
                <h3 className="font-[family-name:var(--font-display)] text-xl">
                  {channelLabel(reportChannel)} message ranking
                </h3>
                <ol className="mt-3 space-y-2">
                  {messageRows
                    .filter((m) => m.sent > 0 || m.replies > 0)
                    .slice(0, 5)
                    .map((row) => (
                      <li
                        key={row.campaignId}
                        className="rounded-lg border border-[color:var(--ink-border)] px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            #{row.rank} {row.name}
                          </span>
                          <span className="text-[color:var(--ink-muted)]">
                            {row.interestedRate != null
                              ? `${row.interestedRate}% int.`
                              : "—"}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-[color:var(--ink-soft)]">
                          {row.message}
                        </p>
                      </li>
                    ))}
                  {!messageRows.some((m) => m.sent > 0 || m.replies > 0) ? (
                    <p className="text-sm text-[color:var(--ink-muted)]">
                      No message results yet.
                    </p>
                  ) : null}
                </ol>
              </section>
            </div>
          )}
        </div>
      ) : tab === "timing" ? (
        !timingRows.some((r) => r.replies > 0) ? (
          <EmptyPanel
            title={`No ${channelLabel(reportChannel)} timing data yet`}
            description={`${channelLabel(reportChannel)} replies will bucket into morning / afternoon / evening so you can see which send windows perform best.`}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise">
            <div className="border-b border-[color:var(--ink-border)] px-5 py-4">
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                {channelLabel(reportChannel)} performance by time of day
              </h2>
              <p className="text-sm text-[color:var(--ink-muted)]">
                Based on when {channelLabel(reportChannel).toLowerCase()} replies
                arrived (America/New_York). Use this to pick morning vs afternoon
                send windows per campaign.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Window</TableHead>
                  <TableHead>Replies</TableHead>
                  <TableHead>Interested</TableHead>
                  <TableHead>Opt-outs</TableHead>
                  <TableHead>Interested %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...timingRows]
                  .sort(
                    (a, b) =>
                      (b.interestedRate ?? -1) - (a.interestedRate ?? -1),
                  )
                  .map((row) => (
                    <TableRow key={row.bucket}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell>{compactNumber(row.replies)}</TableCell>
                      <TableCell>{compactNumber(row.interested)}</TableCell>
                      <TableCell>{compactNumber(row.optOuts)}</TableCell>
                      <TableCell>
                        {row.interestedRate != null
                          ? `${row.interestedRate}%`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : tab === "sources" ? (
        !sourceRows.length ? (
          <EmptyPanel
            title="No report data yet"
            description="Upload leads and run campaigns for this entity to score sources."
          />
        ) : (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-rise">
              <MetricCard
                label={brand ? `${brand.shortName} offered` : "Leads in pool"}
                value={compactNumber(
                  sourceRows.reduce((s, r) => s + r.offered, 0),
                )}
                hint={`${compactNumber(sourceRows.reduce((s, r) => s + r.phoneCapable, 0))} phone · ${compactNumber(sourceRows.reduce((s, r) => s + r.emailCapable, 0))} email`}
              />
              <MetricCard
                label={`${channelLabel(reportChannel)} replies`}
                value={compactNumber(totalReplies)}
                hint={
                  totalReplies
                    ? `${money(Math.round(totalSpend / totalReplies))} / reply`
                    : undefined
                }
              />
              <MetricCard
                label="Conversions"
                value={compactNumber(totalConversions)}
              />
              <MetricCard
                label="Next buy"
                value={best?.source || "—"}
                hint={
                  best?.costPerReply != null
                    ? `Scale up · ${money(best.costPerReply)} / reply`
                    : undefined
                }
              />
            </div>

            <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise-delay-1">
              <div className="border-b border-[color:var(--ink-border)] px-5 py-4">
                <h2 className="font-[family-name:var(--font-display)] text-2xl">
                  {brand
                    ? `${brand.shortName} — sources · ${channelLabel(reportChannel)}`
                    : `Shared pool — sources · ${channelLabel(reportChannel)}`}
                </h2>
                <p className="text-sm text-[color:var(--ink-muted)]">
                  Phone-only vs email-capable counts help you buy lists that match
                  the channel. Reply columns break out SMS vs email when viewing
                  both.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>{brand ? "Offered" : "Leads"}</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Spend</TableHead>
                    {reportChannel === "all" ? (
                      <>
                        <TableHead>SMS replies</TableHead>
                        <TableHead>Email replies</TableHead>
                      </>
                    ) : (
                      <TableHead>Replies</TableHead>
                    )}
                    <TableHead>Cost / reply</TableHead>
                    <TableHead>Conversions</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sourceRows.map((row) => (
                    <TableRow key={row.source}>
                      <TableCell className="font-medium">{row.source}</TableCell>
                      <TableCell>{compactNumber(row.offered)}</TableCell>
                      <TableCell>{compactNumber(row.phoneCapable)}</TableCell>
                      <TableCell>{compactNumber(row.emailCapable)}</TableCell>
                      <TableCell>{money(row.costCents)}</TableCell>
                      {reportChannel === "all" ? (
                        <>
                          <TableCell>
                            {compactNumber(row.smsReplies)}
                          </TableCell>
                          <TableCell>
                            {compactNumber(row.emailReplies)}
                          </TableCell>
                        </>
                      ) : (
                        <TableCell>{compactNumber(row.replies)}</TableCell>
                      )}
                      <TableCell>
                        {row.costPerReply != null
                          ? money(row.costPerReply)
                          : "—"}
                      </TableCell>
                      <TableCell>{compactNumber(row.conversions)}</TableCell>
                      <TableCell>
                        <StatusPill status={row.recommendation} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-rise">
            <MetricCard
              label="Logged spend"
              value={money(
                entityId === "all"
                  ? costRollups.reduce((s, r) => s + r.totalCents, 0)
                  : costTotal,
              )}
            />
            <MetricCard
              label="Cost / reply"
              value={
                entityRollup?.costPerReply != null
                  ? money(entityRollup.costPerReply)
                  : "—"
              }
              hint={
                entityRollup
                  ? `${compactNumber(entityRollup.replies)} replies`
                  : "Pick an entity"
              }
            />
            <MetricCard
              label="Cost / interested"
              value={
                entityRollup?.costPerInterested != null
                  ? money(entityRollup.costPerInterested)
                  : "—"
              }
              hint={
                entityRollup
                  ? `${compactNumber(entityRollup.interested)} interested`
                  : undefined
              }
            />
            <MetricCard
              label="Conversions"
              value={compactNumber(
                entityId === "all"
                  ? costRollups
                      .filter((r) => r.brandId)
                      .reduce((s, r) => s + r.conversions, 0)
                  : entityRollup?.conversions || 0,
              )}
            />
          </div>

          <div className="mb-6 overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise-delay-1">
            <div className="border-b border-[color:var(--ink-border)] px-5 py-4">
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                Spend by company
              </h2>
              <p className="text-sm text-[color:var(--ink-muted)]">
                Texts, emails, setups, and integrations — what each business
                costs vs replies coming back. SMS and email spend stay in separate
                columns.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>SMS</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Setup</TableHead>
                  <TableHead>Integrations</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>$ / reply</TableHead>
                  <TableHead>$ / interested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costRollups.map((row) => (
                  <TableRow key={row.brandId || "shared"}>
                    <TableCell className="font-medium">
                      <button
                        type="button"
                        className="underline-offset-2 hover:underline"
                        onClick={() =>
                          setEntityId(row.brandId || "shared")
                        }
                      >
                        {row.brandName}
                      </button>
                    </TableCell>
                    <TableCell>{money(row.byCategory.sms)}</TableCell>
                    <TableCell>{money(row.byCategory.email)}</TableCell>
                    <TableCell>{money(row.byCategory.leads)}</TableCell>
                    <TableCell>{money(row.byCategory.setup)}</TableCell>
                    <TableCell>{money(row.byCategory.integration)}</TableCell>
                    <TableCell className="font-medium">
                      {money(row.totalCents)}
                    </TableCell>
                    <TableCell>
                      {row.costPerReply != null
                        ? money(row.costPerReply)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {row.costPerInterested != null
                        ? money(row.costPerInterested)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <form
            onSubmit={addCost}
            className="mb-6 grid gap-3 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-2 md:grid-cols-2 xl:grid-cols-6"
          >
            <div className="space-y-2 xl:col-span-1">
              <Label>Company</Label>
              <Select
                value={costBrandId}
                onValueChange={(value) => {
                  if (value) setCostBrandId(value);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shared">Shared / overhead</SelectItem>
                  {data.brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.shortName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(value) => {
                  if (value) setCategory(value as CostCategory);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COST_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {costCategoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Telnyx SMS Oct"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Telnyx / Instantly / Neon"
              />
            </div>
            <div className="space-y-2">
              <Label>Amount (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={incurredAt}
                onChange={(e) => setIncurredAt(e.target.value)}
                required
              />
            </div>
            <div className="flex items-end md:col-span-2 xl:col-span-6">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Log cost"}
              </Button>
            </div>
          </form>

          <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)]">
            <div className="border-b border-[color:var(--ink-border)] px-5 py-4">
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                Cost ledger
              </h2>
              <p className="text-sm text-[color:var(--ink-muted)]">
                Every connection and send cost you log shows up here.
              </p>
            </div>
            {costEntries.length === 0 ? (
              <div className="p-5">
                <EmptyPanel
                  title="No costs logged for this view"
                  description="Add SMS, email, setup, or integration spend above."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{entry.incurredAt}</TableCell>
                      <TableCell>
                        {entry.brandId
                          ? data.brands.find((b) => b.id === entry.brandId)
                              ?.shortName || entry.brandId
                          : "Shared"}
                      </TableCell>
                      <TableCell>
                        {costCategoryLabel(entry.category)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{entry.label}</div>
                        {entry.notes ? (
                          <div className="text-xs text-[color:var(--ink-muted)]">
                            {entry.notes}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{entry.vendor || "—"}</TableCell>
                      <TableCell>{money(entry.amountCents)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void removeCost(entry.id)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ImproveCard({
  title,
  subtitle,
  primary,
  meta,
  warn,
  detail,
}: {
  title: string;
  subtitle: string;
  primary: string;
  meta: string;
  warn?: string;
  detail?: string;
}) {
  return (
    <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--ink-muted)]">
        {title}
      </p>
      <p className="mt-1 text-xs text-[color:var(--ink-soft)]">{subtitle}</p>
      <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl tracking-tight text-[color:var(--ink)]">
        {primary}
      </h3>
      <p className="mt-2 text-sm text-[color:var(--ink-muted)]">{meta}</p>
      {detail ? (
        <p className="mt-3 line-clamp-3 rounded-lg bg-[color:var(--panel-hover)] px-3 py-2 text-xs text-[color:var(--ink-soft)]">
          {detail}
        </p>
      ) : null}
      {warn ? (
        <p className="mt-3 text-xs text-[color:var(--brand-accent)]">{warn}</p>
      ) : null}
    </section>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading reports…" />}>
      <ReportsInner />
    </Suspense>
  );
}
