"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { buttonVariants } from "@/components/ui/button";
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
import { entitySourceResults, poolSourceResults } from "@/lib/analytics";
import { compactNumber, money } from "@/lib/client-format";
import { cn } from "@/lib/utils";

function ReportsInner() {
  const { data, loading, error, refresh } = usePlatform();
  const searchParams = useSearchParams();
  const [entityId, setEntityId] = useState(
    searchParams.get("entity") || "all",
  );

  const rows = useMemo(() => {
    if (!data) return [];
    if (entityId === "all") return poolSourceResults(data);
    return entitySourceResults(data, entityId);
  }, [data, entityId]);

  if (loading) return <LoadingPanel label="Loading reports…" />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  const brand =
    entityId === "all"
      ? null
      : data.brands.find((b) => b.id === entityId) || null;

  const totalSpend = rows.reduce((sum, row) => sum + row.costCents, 0);
  const totalReplies = rows.reduce((sum, row) => sum + row.replies, 0);
  const totalConversions = rows.reduce((sum, row) => sum + row.conversions, 0);
  const best = rows.find((r) => r.recommendation === "scale_up");
  const worst = rows.find((r) => r.recommendation === "cut");

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Pick an entity to see which lead sources win for that business — or view the shared pool ranking."
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

      <div className="mb-6 max-w-sm space-y-2 animate-rise">
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
            <SelectItem value="all">Shared pool (all entities)</SelectItem>
            {data.brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!rows.length ? (
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
                rows.reduce((s, r) => s + r.offered, 0),
              )}
            />
            <MetricCard
              label="Replies"
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
                  : worst
                    ? `Watch ${worst.source}`
                    : undefined
              }
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise-delay-1">
            <div className="border-b border-[color:var(--ink-border)] px-5 py-4">
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                {brand
                  ? `${brand.shortName} — results by lead source`
                  : "Shared pool — results by lead source"}
              </h2>
              <p className="text-sm text-[color:var(--ink-muted)]">
                {brand
                  ? `Only contacts offered under ${brand.name}. Other entities’ campaigns never appear here.`
                  : "Blended across every portal. Open an entity report for business-specific winners."}
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>{brand ? "Offered" : "Leads"}</TableHead>
                  <TableHead>Spend</TableHead>
                  <TableHead>Replies</TableHead>
                  <TableHead>Interested</TableHead>
                  <TableHead>Cost / reply</TableHead>
                  <TableHead>Conversions</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.source}>
                    <TableCell className="font-medium">{row.source}</TableCell>
                    <TableCell>{compactNumber(row.offered)}</TableCell>
                    <TableCell>{money(row.costCents)}</TableCell>
                    <TableCell>{compactNumber(row.replies)}</TableCell>
                    <TableCell>{compactNumber(row.interested)}</TableCell>
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
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading reports…" />}>
      <ReportsInner />
    </Suspense>
  );
}
