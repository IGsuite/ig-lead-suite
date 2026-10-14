"use client";

import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import {
  EntityScoreRow,
  PerformanceScorecards,
} from "@/components/performance-widgets";
import { StatusPill } from "@/components/status-pill";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { buttonVariants } from "@/components/ui/button";
import {
  allEntityPerformanceScores,
  entityPerformanceScores,
} from "@/lib/analytics";
import { compactNumber, money } from "@/lib/client-format";
import { usePlatform } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";

function costPerReply(costCents: number, replies: number) {
  if (!replies) return "—";
  return money(Math.round(costCents / replies));
}

export default function DashboardPage() {
  const { data, loading, error, refresh } = usePlatform();

  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  const fresh = data.leads.filter(
    (l) => !l.optedOut && l.offeredEntityIds.length === 0,
  ).length;
  const optedOut = data.leads.filter((l) => l.optedOut).length;
  const unread = data.replies.filter((r) => !r.read).length;
  const activeCampaigns = data.campaigns.filter((c) => c.status === "sending");
  const bestSource = [...data.providerSpend]
    .filter((p) => p.replies > 0)
    .sort((a, b) => a.costCents / a.replies - b.costCents / b.replies)[0];
  const rotating = data.brands.filter((b) => b.rotationEnabled);
  const poolSmsScores = entityPerformanceScores(data, "all", "sms");
  const poolEmailScores = entityPerformanceScores(data, "all", "email");
  const entitySmsScores = allEntityPerformanceScores(data, false, "sms");
  const entityEmailScores = allEntityPerformanceScores(data, false, "email");

  const entityCoverage = data.brands.map((brand) => {
    const offered = data.leads.filter((l) =>
      l.offeredEntityIds.includes(brand.id),
    ).length;
    const stillOpen = data.leads.filter(
      (l) =>
        !l.optedOut &&
        l.status !== "converted" &&
        !l.offeredEntityIds.includes(brand.id),
    ).length;
    return { brand, offered, stillOpen };
  });

  return (
    <div>
      <PageHeader
        title="Multi-entity command desk"
        description="Upload leads once, verify contacts, then Autopilot rotates them through Abstract, Ahava, Take More, Venture, and TYH. Each entity keeps its own campaigns and reports — nothing mixes."
        actions={
          <>
            <Link
              href="/inbox"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Inbox
            </Link>
            <Link
              href="/leads"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Leads
            </Link>
            <Link
              href="/creatives"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Ads
            </Link>
            <Link href="/campaigns" className={cn(buttonVariants())}>
              Campaigns
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-rise">
        <MetricCard
          label="Shared lead pool"
          value={compactNumber(data.leads.length)}
          hint={`${compactNumber(fresh)} never offered · ${compactNumber(optedOut)} suppressed`}
        />
        <MetricCard
          label="Unread replies"
          value={compactNumber(unread)}
          hint="Interested replies route to that entity’s CRM / site API"
        />
        <MetricCard
          label="Rotation entities"
          value={compactNumber(rotating.length)}
          hint={data.rotation.entityOrder
            .map(
              (id) => data.brands.find((b) => b.id === id)?.shortName || id,
            )
            .join(" → ")}
        />
        <MetricCard
          label="Best source CPA reply"
          value={
            bestSource
              ? costPerReply(bestSource.costCents, bestSource.replies)
              : "—"
          }
          hint="Buy more from winners, drop losers weekly"
        />
      </div>

      <section className="mt-6 animate-rise-delay-1">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl">
              Pool performance
            </h2>
            <p className="text-sm text-[color:var(--ink-muted)]">
              SMS and email scorecards stay separate — reply, interested,
              conversions, and cost efficiency per channel.
            </p>
          </div>
          <Link
            href="/reports?tab=performance&channel=all"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Full reports
          </Link>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
            <PerformanceScorecards scores={poolSmsScores} title="SMS" />
          </section>
          <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
            <PerformanceScorecards scores={poolEmailScores} title="Email" />
          </section>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-medium uppercase tracking-[0.08em] text-[color:var(--ink-muted)]">
              By company · SMS
            </h3>
            <div className="grid gap-3">
              {entitySmsScores.map((row) => (
                <Link
                  key={`sms-${row.brandId || "all"}`}
                  href={`/reports?tab=improve&entity=${row.brandId}&channel=sms`}
                >
                  <EntityScoreRow scores={row} />
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium uppercase tracking-[0.08em] text-[color:var(--ink-muted)]">
              By company · Email
            </h3>
            <div className="grid gap-3">
              {entityEmailScores.map((row) => (
                <Link
                  key={`email-${row.brandId || "all"}`}
                  href={`/reports?tab=improve&entity=${row.brandId}&channel=email`}
                >
                  <EntityScoreRow scores={row} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-1">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          Quick links
        </h2>
        <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
          Same order as the sidebar — day-to-day ops first.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { href: "/inbox", label: "Inbox" },
            { href: "/leads", label: "Leads" },
            { href: "/reports", label: "Reports" },
            { href: "/campaigns", label: "Campaigns" },
            { href: "/creatives", label: "Ads" },
            { href: "/autopilot", label: "Autopilot" },
            { href: "/brands", label: "Entities" },
            { href: "/setup", label: "Go live" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr] animate-rise-delay-2">
        <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">
              Entity portals
            </h2>
            <Link
              href="/brands"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Open entities
            </Link>
          </div>
          <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
            Each company has its own sending identity, offer, and website API
            hook — still one backend.
          </p>
          <div className="mt-4 space-y-3">
            {data.brands.map((brand) => {
              const coverage = entityCoverage.find((e) => e.brand.id === brand.id);
              return (
                <Link
                  key={brand.id}
                  href={`/brands/${brand.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-[color:var(--ink-border)] px-4 py-3 transition-colors hover:bg-[color:var(--panel-hover)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium">{brand.name}</div>
                    <div className="text-xs text-[color:var(--ink-muted)]">
                      {brand.focus}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--ink-soft)]">
                      {coverage
                        ? `${compactNumber(coverage.stillOpen)} still available for this offer · ${compactNumber(coverage.offered)} already offered`
                        : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill status={brand.status} />
                    {brand.rotationEnabled ? (
                      <span className="rounded-md border border-[color:var(--ink-border)] bg-[color:var(--accent-soft)]/50 px-2 py-0.5 text-xs">
                        In rotation
                      </span>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            How the pool works
          </h2>
          <ol className="mt-4 space-y-3 text-sm text-[color:var(--ink-soft)]">
            <li className="rounded-xl bg-[color:var(--accent-soft)]/50 px-3 py-2">
              Upload once into the shared pool (source, date, cost).
            </li>
            <li className="rounded-xl bg-[color:var(--panel-hover)] px-3 py-2">
              Launch an Abstract blast, then Ahava or Take More, then Venture
              or TYH — same leads, different programs.
            </li>
            <li className="rounded-xl bg-[color:var(--panel-hover)] px-3 py-2">
              Rotation prefers contacts who haven’t heard from that entity yet.
            </li>
            <li className="rounded-xl bg-[color:var(--panel-hover)] px-3 py-2">
              Interested reply syncs to that entity’s CRM / website API. Global
              STOP blocks everyone.
            </li>
          </ol>
          <p className="mt-4 text-xs text-[color:var(--ink-muted)]">
            Active campaigns: {compactNumber(activeCampaigns.length)}. Mode:{" "}
            {data.rotation.mode.replace("_", " ")}.
          </p>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            Source performance
          </h2>
          <Link
            href="/results"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Full results
          </Link>
        </div>
        <div className="mt-4 space-y-4">
          {data.providerSpend.map((row) => {
            const cpr = row.replies ? row.costCents / row.replies : 0;
            const max = Math.max(
              ...data.providerSpend.map((p) =>
                p.replies ? p.costCents / p.replies : 0,
              ),
              1,
            );
            const width = row.replies ? Math.max(12, (cpr / max) * 100) : 8;
            return (
              <div key={row.source}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{row.source}</span>
                  <span className="text-[color:var(--ink-muted)]">
                    {costPerReply(row.costCents, row.replies)} / reply ·{" "}
                    {compactNumber(row.replies)} replies
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[color:var(--panel-hover)]">
                  <div
                    className="bar-fill h-full rounded-full bg-[color:var(--ink)]"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
