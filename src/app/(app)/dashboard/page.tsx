"use client";

import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { buttonVariants } from "@/components/ui/button";
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
  if (error || !data) return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  const available = data.leads.filter((l) => l.status === "available").length;
  const optedOut = data.leads.filter((l) => l.optedOut).length;
  const unread = data.replies.filter((r) => !r.read).length;
  const brand1 = data.brands.find((b) => b.id === "brand-1");
  const activeCampaigns = data.campaigns.filter((c) => c.status === "sending");
  const bestSource = [...data.providerSpend]
    .filter((p) => p.replies > 0)
    .sort((a, b) => a.costCents / a.replies - b.costCents / b.replies)[0];

  return (
    <div>
      <PageHeader
        title="Command overview"
        description="Shared lead pool, Brand 1 warm-up, and source economics in one desk. Replace placeholder brand names once your five domains are locked."
        actions={
          <>
            <Link
              href="/leads"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Upload leads
            </Link>
            <Link href="/campaigns/new" className={cn(buttonVariants())}>
              New campaign
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-rise">
        <MetricCard
          label="Lead pool"
          value={compactNumber(data.leads.length)}
          hint={`${compactNumber(available)} available · ${compactNumber(optedOut)} suppressed`}
        />
        <MetricCard
          label="Unread replies"
          value={compactNumber(unread)}
          hint="Answer interested replies fast — CRM sync is mocked"
        />
        <MetricCard
          label="Active campaigns"
          value={compactNumber(activeCampaigns.length)}
          hint={
            brand1
              ? `${brand1.name} weekly cap ${compactNumber(brand1.weeklySendCap)}`
              : "No pilot brand"
          }
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

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr] animate-rise-delay-1">
        <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">
              Brand readiness
            </h2>
            <Link
              href="/brands"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Open brands
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {data.brands.map((brand) => (
              <Link
                key={brand.id}
                href={`/brands/${brand.id}`}
                className="flex flex-col gap-2 rounded-xl border border-[color:var(--ink-border)] px-4 py-3 transition-colors hover:bg-[color:var(--panel-hover)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium">{brand.name}</div>
                  <div className="text-xs text-[color:var(--ink-muted)]">
                    {brand.domain} · {brand.sendingSubdomain}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill status={brand.status} />
                  <StatusPill status={brand.tenDlcStatus} />
                  <StatusPill status={brand.emailAuthStatus} />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            This week’s checklist
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-[color:var(--ink-soft)]">
            <li className="rounded-xl bg-[color:var(--accent-soft)]/50 px-3 py-2">
              Start / chase company 10DLC registration — longest lead time.
            </li>
            <li className="rounded-xl bg-[color:var(--panel-hover)] px-3 py-2">
              Lock Brand 1 domain auth (SPF/DKIM/DMARC on mail subdomain).
            </li>
            <li className="rounded-xl bg-[color:var(--panel-hover)] px-3 py-2">
              Keep warm-up volumes low; watch bounce and opt-out rates.
            </li>
            <li className="rounded-xl bg-[color:var(--panel-hover)] px-3 py-2">
              Review cost per reply by provider before the next buy.
            </li>
          </ul>
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
