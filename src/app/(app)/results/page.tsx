"use client";

import Link from "next/link";
import { useMemo } from "react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlatform } from "@/hooks/use-platform";
import { entitySourceResults, poolSourceResults } from "@/lib/analytics";
import { compactNumber, money } from "@/lib/client-format";
import { cn } from "@/lib/utils";

export default function ResultsPage() {
  const { data, loading, error, refresh } = usePlatform();

  const poolRows = useMemo(
    () => (data ? poolSourceResults(data) : []),
    [data],
  );

  const byEntity = useMemo(() => {
    if (!data) return [];
    return data.brands.map((brand) => ({
      brand,
      rows: entitySourceResults(data, brand.id).slice(0, 3),
    }));
  }, [data]);

  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  if (!poolRows.length) {
    return (
      <>
        <PageHeader
          title="Results by source"
          description="Cost per reply and conversions by lead provider — globally and per entity."
        />
        <EmptyPanel
          title="No source data yet"
          description="Import a paid list to start tracking provider ROI."
        />
      </>
    );
  }

  const totalSpend = poolRows.reduce((sum, row) => sum + row.costCents, 0);
  const totalReplies = poolRows.reduce((sum, row) => sum + row.replies, 0);
  const totalConversions = poolRows.reduce(
    (sum, row) => sum + row.conversions,
    0,
  );
  const best = poolRows.find((r) => r.recommendation === "scale_up");
  const worst = poolRows.find((r) => r.recommendation === "cut");

  return (
    <div>
      <PageHeader
        title="Results by source"
        description="Keep buying from providers that win on cost per reply. Open any entity portal to see which sources win for that business."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-rise">
        <MetricCard label="Total list spend" value={money(totalSpend)} />
        <MetricCard
          label="Replies attributed"
          value={compactNumber(totalReplies)}
          hint={
            totalReplies
              ? `${money(Math.round(totalSpend / totalReplies))} blended / reply`
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
              ? `${money(best.costPerReply)} / reply · scale up`
              : worst
                ? `Cut ${worst.source}`
                : undefined
          }
        />
      </div>

      <div className="mb-8 overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise-delay-1">
        <div className="border-b border-[color:var(--ink-border)] px-5 py-4">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            Shared pool ranking
          </h2>
          <p className="text-sm text-[color:var(--ink-muted)]">
            Across all entities — who gives the cheapest replies overall.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Leads</TableHead>
              <TableHead>Spend</TableHead>
              <TableHead>Replies</TableHead>
              <TableHead>Interested</TableHead>
              <TableHead>Cost / reply</TableHead>
              <TableHead>Conversions</TableHead>
              <TableHead>Recommendation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {poolRows.map((row) => (
              <TableRow key={row.source}>
                <TableCell className="font-medium">{row.source}</TableCell>
                <TableCell>{compactNumber(row.offered)}</TableCell>
                <TableCell>{money(row.costCents)}</TableCell>
                <TableCell>{compactNumber(row.replies)}</TableCell>
                <TableCell>{compactNumber(row.interested)}</TableCell>
                <TableCell>
                  {row.costPerReply != null ? money(row.costPerReply) : "—"}
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

      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            Per-entity winners
          </h2>
          <p className="text-sm text-[color:var(--ink-muted)]">
            Same lead source can win for one business and lose for another.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 animate-rise-delay-2">
        {byEntity.map(({ brand, rows }) => (
          <div
            key={brand.id}
            className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-xl">
                  {brand.shortName}
                </h3>
                <p className="text-xs text-[color:var(--ink-muted)]">
                  {brand.focus}
                </p>
              </div>
              <Link
                href={`/brands/${brand.id}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Open
              </Link>
            </div>
            {rows.length === 0 ? (
              <p className="mt-4 text-sm text-[color:var(--ink-muted)]">
                No offered leads yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {rows.map((row) => (
                  <li
                    key={`${brand.id}-${row.source}`}
                    className="flex items-center justify-between gap-2 rounded-xl bg-[color:var(--panel-hover)] px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{row.source}</div>
                      <div className="text-xs text-[color:var(--ink-muted)]">
                        {compactNumber(row.replies)} replies ·{" "}
                        {row.costPerReply != null
                          ? `${money(row.costPerReply)} / reply`
                          : "no replies"}
                      </div>
                    </div>
                    <StatusPill status={row.recommendation} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
