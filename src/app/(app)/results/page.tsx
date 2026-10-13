"use client";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/state-panels";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlatform } from "@/hooks/use-platform";
import { compactNumber, money } from "@/lib/client-format";

export default function ResultsPage() {
  const { data, loading, error, refresh } = usePlatform();

  if (loading) return <LoadingPanel />;
  if (error || !data)
    return <ErrorPanel message={error || "Unknown error"} onRetry={refresh} />;

  if (!data.providerSpend.length) {
    return (
      <>
        <PageHeader
          title="Results by source"
          description="Cost per reply and conversions by lead provider."
        />
        <EmptyPanel
          title="No source data yet"
          description="Import a paid list to start tracking provider ROI."
        />
      </>
    );
  }

  const totalSpend = data.providerSpend.reduce((sum, row) => sum + row.costCents, 0);
  const totalReplies = data.providerSpend.reduce((sum, row) => sum + row.replies, 0);
  const totalConversions = data.providerSpend.reduce(
    (sum, row) => sum + row.conversions,
    0,
  );

  const ranked = [...data.providerSpend].sort((a, b) => {
    const aCpr = a.replies ? a.costCents / a.replies : Infinity;
    const bCpr = b.replies ? b.costCents / b.replies : Infinity;
    return aCpr - bCpr;
  });

  return (
    <div>
      <PageHeader
        title="Results by source"
        description="Weekly ritual: keep buying from providers that win on cost per reply, drop the ones that don’t."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3 animate-rise">
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
      </div>

      <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise-delay-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Leads bought</TableHead>
              <TableHead>Spend</TableHead>
              <TableHead>Replies</TableHead>
              <TableHead>Cost / reply</TableHead>
              <TableHead>Conversions</TableHead>
              <TableHead>Recommendation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((row, index) => {
              const cpr = row.replies
                ? money(Math.round(row.costCents / row.replies))
                : "—";
              return (
                <TableRow key={row.source}>
                  <TableCell className="font-medium">{row.source}</TableCell>
                  <TableCell>{compactNumber(row.leadsPurchased)}</TableCell>
                  <TableCell>{money(row.costCents)}</TableCell>
                  <TableCell>{compactNumber(row.replies)}</TableCell>
                  <TableCell>{cpr}</TableCell>
                  <TableCell>{compactNumber(row.conversions)}</TableCell>
                  <TableCell>
                    {index === 0
                      ? "Scale up"
                      : index === ranked.length - 1
                        ? "Cut or renegotiate"
                        : "Hold"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
