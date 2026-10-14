"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
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
  costCategoryLabel,
  entityCostRollups,
  entitySourceResults,
  filterCostEntries,
  poolSourceResults,
  timeOfDayResults,
} from "@/lib/analytics";
import { compactNumber, money } from "@/lib/client-format";
import type { CostCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

function ReportsInner() {
  const { data, loading, error, refresh } = usePlatform();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<"sources" | "costs" | "timing">(
    initialTab === "costs"
      ? "costs"
      : initialTab === "timing"
        ? "timing"
        : "sources",
  );
  const [entityId, setEntityId] = useState(
    searchParams.get("entity") || "all",
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

  const sourceRows = useMemo(() => {
    if (!data) return [];
    if (entityId === "all") return poolSourceResults(data);
    return entitySourceResults(data, entityId);
  }, [data, entityId]);

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
    return timeOfDayResults(data, scope);
  }, [data, entityId]);

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

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Source performance and full cost tracking per company — SMS, email, setups, integrations — so you can see return on spend."
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
        <Button
          type="button"
          variant={tab === "sources" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("sources")}
        >
          Sources
        </Button>
        <Button
          type="button"
          variant={tab === "timing" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("timing")}
        >
          Send timing
        </Button>
        <Button
          type="button"
          variant={tab === "costs" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("costs")}
        >
          Costs & ROI
        </Button>
      </div>

      <div className="mb-6 max-w-sm space-y-2">
        <label className="text-sm font-medium">
          {tab === "sources" ? "Report for" : "Costs for"}
        </label>
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

      {tab === "timing" ? (
        !timingRows.some((r) => r.replies > 0) ? (
          <EmptyPanel
            title="No timing data yet"
            description="Replies will bucket into morning / afternoon / evening so you can see which send windows perform best."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] animate-rise">
            <div className="border-b border-[color:var(--ink-border)] px-5 py-4">
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                Performance by time of day
              </h2>
              <p className="text-sm text-[color:var(--ink-muted)]">
                Based on when replies arrived (America/New_York). Use this to
                pick morning vs afternoon send windows per campaign.
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
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>{brand ? "Offered" : "Leads"}</TableHead>
                    <TableHead>Spend</TableHead>
                    <TableHead>Replies</TableHead>
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
                      <TableCell>{money(row.costCents)}</TableCell>
                      <TableCell>{compactNumber(row.replies)}</TableCell>
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
                  : entityId === "all"
                    ? "—"
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
                costs vs replies coming back.
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

export default function ReportsPage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading reports…" />}>
      <ReportsInner />
    </Suspense>
  );
}
