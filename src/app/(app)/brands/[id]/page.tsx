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
import { compactNumber, crmLabel, relativeDay } from "@/lib/client-format";
import type { Brand, Campaign, Lead, Reply } from "@/lib/types";
import { cn } from "@/lib/utils";

type BrandPayload = {
  brand: Brand;
  campaigns: Campaign[];
  leads: Lead[];
  replies: Reply[];
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
      if (!res.ok) throw new Error("Brand not found");
      setPayload((await res.json()) as BrandPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load brand");
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
      toast.success("Brand settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingPanel label="Loading brand workspace…" />;
  if (error || !payload)
    return <ErrorPanel message={error || "Unknown error"} onRetry={load} />;

  const { brand, campaigns, leads, replies } = payload;

  return (
    <div>
      <PageHeader
        title={brand.name}
        description={`${brand.domain} workspace — sending domain, texting numbers, CRM, and campaigns for this brand only.`}
        actions={
          <>
            <Link
              href="/brands"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              All brands
            </Link>
            <Link
              href={`/campaigns/new?brandId=${brand.id}`}
              className={cn(buttonVariants())}
            >
              Campaign for {brand.name}
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
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5 animate-rise-delay-1">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            Sending setup
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Brand name</Label>
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
                onValueChange={(value) =>
                  setPayload({
                    ...payload,
                    brand: {
                      ...brand,
                      status: value as Brand["status"],
                    },
                  })
                }
              >
                <SelectTrigger>
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
                onValueChange={(value) =>
                  setPayload({
                    ...payload,
                    brand: { ...brand, crm: value as Brand["crm"] },
                  })
                }
              >
                <SelectTrigger>
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
          <Button className="mt-4" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save brand settings"}
          </Button>
        </section>

        <section className="space-y-4 animate-rise-delay-2">
          <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">
              Workspace pulse
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-[color:var(--panel-hover)] p-3">
                <dt className="text-[color:var(--ink-muted)]">Assigned leads</dt>
                <dd className="mt-1 text-2xl font-[family-name:var(--font-display)]">
                  {compactNumber(leads.length)}
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
                  No campaigns yet for this brand.
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
        </section>
      </div>
    </div>
  );
}

export default function BrandWorkspacePage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading brand workspace…" />}>
      <BrandWorkspaceInner />
    </Suspense>
  );
}
