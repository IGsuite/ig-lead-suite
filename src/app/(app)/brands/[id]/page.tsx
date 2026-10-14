"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { compactNumber, crmLabel, money, relativeDay } from "@/lib/client-format";
import type {
  Brand,
  Campaign,
  EntitySourceResult,
  Lead,
  Reply,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type BrandPayload = {
  brand: Brand;
  campaigns: Campaign[];
  leads: Lead[];
  replies: Reply[];
  sourceResults: EntitySourceResult[];
};

function BrandWorkspaceInner() {
  const params = useParams<{ id: string }>();
  const [payload, setPayload] = useState<BrandPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${params.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Entity not found");
      setPayload((await res.json()) as BrandPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entity");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function save() {
    if (!payload) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/brands/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.brand),
      });
      if (!res.ok) throw new Error("Save failed");
      const brand = (await res.json()) as Brand;
      setPayload({ ...payload, brand });
      toast.success("Entity settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingPanel label="Loading entity portal…" />;
  if (error || !payload)
    return <ErrorPanel message={error || "Unknown error"} onRetry={load} />;

  const { brand, campaigns, replies, sourceResults } = payload;
  const offeredCount = payload.leads.length;
  const scaleSources = sourceResults.filter((r) => r.recommendation === "scale_up");
  const cutSources = sourceResults.filter((r) => r.recommendation === "cut");

  return (
    <div>
      <PageHeader
        title={brand.name}
        description={`${brand.focus}. See which lead sources convert for this portal — then buy more of the winners.`}
        actions={
          <>
            <Link
              href="/brands"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              All entities
            </Link>
            <Link
              href={`/inbox?entity=${brand.id}`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Inbox
            </Link>
            <Link
              href={`/reports?entity=${brand.id}`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Reports
            </Link>
            <Link
              href={`/campaigns?brandId=${brand.id}`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Campaigns
            </Link>
            <Link
              href={`/campaigns/new?brandId=${brand.id}`}
              className={cn(buttonVariants())}
            >
              New campaign
            </Link>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2 animate-rise">
        <StatusPill status={brand.status} />
        <StatusPill status={brand.tenDlcStatus} />
        <StatusPill status={brand.emailAuthStatus} />
        <span className="rounded-md border border-[color:var(--ink-border)] bg-[color:var(--panel)] px-2.5 py-1 text-xs">
          CRM: {crmLabel(brand.crm)}
        </span>
        {brand.rotationEnabled ? (
          <span className="rounded-md border border-[color:var(--ink-border)] bg-[color:var(--accent-soft)]/50 px-2.5 py-1 text-xs">
            In shared rotation
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-1">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            Portal setup
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Entity name</Label>
              <Input
                value={brand.name}
                onChange={(e) =>
                  setPayload({
                    ...payload,
                    brand: { ...brand, name: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Short name</Label>
              <Input
                value={brand.shortName}
                onChange={(e) =>
                  setPayload({
                    ...payload,
                    brand: { ...brand, shortName: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Focus / what this entity sells</Label>
              <Input
                value={brand.focus}
                onChange={(e) =>
                  setPayload({
                    ...payload,
                    brand: { ...brand, focus: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Root domain</Label>
              <Input
                value={brand.domain}
                onChange={(e) =>
                  setPayload({
                    ...payload,
                    brand: { ...brand, domain: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Sending subdomain</Label>
              <Input
                value={brand.sendingSubdomain}
                onChange={(e) =>
                  setPayload({
                    ...payload,
                    brand: { ...brand, sendingSubdomain: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Website URL</Label>
              <Input
                value={brand.websiteUrl}
                onChange={(e) =>
                  setPayload({
                    ...payload,
                    brand: { ...brand, websiteUrl: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Website / CRM API endpoint</Label>
              <Input
                value={brand.websiteApiUrl}
                placeholder="https://…/api/leads"
                onChange={(e) =>
                  setPayload({
                    ...payload,
                    brand: { ...brand, websiteApiUrl: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Weekly send cap</Label>
              <Input
                type="number"
                value={brand.weeklySendCap}
                onChange={(e) =>
                  setPayload({
                    ...payload,
                    brand: {
                      ...brand,
                      weeklySendCap: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={brand.status}
                onValueChange={(value) => {
                  if (!value) return;
                  setPayload({
                    ...payload,
                    brand: {
                      ...brand,
                      status: value as Brand["status"],
                    },
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="setup">Setup</SelectItem>
                  <SelectItem value="warming">Warming</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>CRM</Label>
              <Select
                value={brand.crm}
                onValueChange={(value) => {
                  if (!value) return;
                  setPayload({
                    ...payload,
                    brand: { ...brand, crm: value as Brand["crm"] },
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hubspot">HubSpot</SelectItem>
                  <SelectItem value="salesforce">Salesforce</SelectItem>
                  <SelectItem value="gohighlevel">GoHighLevel</SelectItem>
                  <SelectItem value="pipedrive">Pipedrive</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Label>Programs (comma-separated)</Label>
            <Input
              value={brand.programs.join(", ")}
              onChange={(e) =>
                setPayload({
                  ...payload,
                  brand: {
                    ...brand,
                    programs: e.target.value
                      .split(",")
                      .map((p) => p.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </div>
          <div className="mt-4 space-y-2">
            <Label>Texting numbers (one per line)</Label>
            <textarea
              className="min-h-28 w-full rounded-lg border border-[color:var(--ink-border)] bg-transparent px-3 py-2 text-sm"
              value={brand.phoneNumbers.join("\n")}
              onChange={(e) =>
                setPayload({
                  ...payload,
                  brand: {
                    ...brand,
                    phoneNumbers: e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={brand.rotationEnabled}
              onChange={(e) =>
                setPayload({
                  ...payload,
                  brand: { ...brand, rotationEnabled: e.target.checked },
                })
              }
            />
            Include in shared-pool offer rotation
          </label>
          <Button className="mt-4" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save entity settings"}
          </Button>
        </section>

        <section className="space-y-4 animate-rise-delay-2">
          <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">
              Portal pulse
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-[color:var(--panel-hover)] p-3">
                <dt className="text-[color:var(--ink-muted)]">Offered from pool</dt>
                <dd className="mt-1 text-2xl font-[family-name:var(--font-display)]">
                  {compactNumber(offeredCount)}
                </dd>
              </div>
              <div className="rounded-xl bg-[color:var(--panel-hover)] p-3">
                <dt className="text-[color:var(--ink-muted)]">Campaigns</dt>
                <dd className="mt-1 text-2xl font-[family-name:var(--font-display)]">
                  {compactNumber(campaigns.length)}
                </dd>
              </div>
              <div className="rounded-xl bg-[color:var(--panel-hover)] p-3">
                <dt className="text-[color:var(--ink-muted)]">Replies</dt>
                <dd className="mt-1 text-2xl font-[family-name:var(--font-display)]">
                  {compactNumber(replies.length)}
                </dd>
              </div>
              <div className="rounded-xl bg-[color:var(--panel-hover)] p-3">
                <dt className="text-[color:var(--ink-muted)]">Numbers ready</dt>
                <dd className="mt-1 text-2xl font-[family-name:var(--font-display)]">
                  {compactNumber(brand.phoneNumbers.length)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">
              Recent campaigns
            </h2>
            <div className="mt-3 space-y-2">
              {campaigns.length === 0 ? (
                <p className="text-sm text-[color:var(--ink-muted)]">
                  No campaigns yet for this entity.
                </p>
              ) : (
                campaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="rounded-xl border border-[color:var(--ink-border)] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{campaign.name}</div>
                      <StatusPill status={campaign.status} />
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--ink-muted)]">
                      {campaign.channel.toUpperCase()} · sent{" "}
                      {compactNumber(campaign.sentCount)} ·{" "}
                      {relativeDay(campaign.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {(scaleSources.length > 0 || cutSources.length > 0) && (
            <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                Buy more / cut
              </h2>
              <div className="mt-3 space-y-2 text-sm">
                {scaleSources.map((row) => (
                  <div
                    key={`scale-${row.source}`}
                    className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-950"
                  >
                    Scale up <strong>{row.source}</strong> —{" "}
                    {row.costPerReply != null
                      ? `${money(row.costPerReply)} / reply`
                      : "best performer"}
                  </div>
                ))}
                {cutSources.map((row) => (
                  <div
                    key={`cut-${row.source}`}
                    className="rounded-xl bg-rose-50 px-3 py-2 text-rose-950"
                  >
                    Cut or renegotiate <strong>{row.source}</strong> —{" "}
                    {row.costPerReply != null
                      ? `${money(row.costPerReply)} / reply`
                      : "weak replies"}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-2">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl">
              Results by lead source
            </h2>
            <p className="text-sm text-[color:var(--ink-muted)]">
              For {brand.shortName} only — which providers send the best leads to
              this business.
            </p>
          </div>
        </div>
        {sourceResults.length === 0 ? (
          <p className="text-sm text-[color:var(--ink-muted)]">
            No offered leads yet. Launch a campaign from the shared pool to start
            scoring sources for this portal.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[color:var(--ink-border)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Offered</TableHead>
                  <TableHead>Replies</TableHead>
                  <TableHead>Interested</TableHead>
                  <TableHead>Conversions</TableHead>
                  <TableHead>Cost / reply</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceResults.map((row) => (
                  <TableRow key={row.source}>
                    <TableCell className="font-medium">{row.source}</TableCell>
                    <TableCell>{compactNumber(row.offered)}</TableCell>
                    <TableCell>{compactNumber(row.replies)}</TableCell>
                    <TableCell>{compactNumber(row.interested)}</TableCell>
                    <TableCell>{compactNumber(row.conversions)}</TableCell>
                    <TableCell>
                      {row.costPerReply != null ? money(row.costPerReply) : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={row.recommendation} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function BrandWorkspacePage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading entity portal…" />}>
      <BrandWorkspaceInner />
    </Suspense>
  );
}
