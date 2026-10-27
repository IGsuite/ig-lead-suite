"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompanyGoLive, ReadinessCheck, ReadinessState } from "@/lib/go-live";

const labels: Record<ReadinessState, string> = { active: "Active", inactive: "Inactive", pending: "Pending review", needs_attention: "Needs attention", not_connected: "Not connected" };
const tones: Record<ReadinessState, string> = { active: "bg-emerald-100 text-emerald-900", inactive: "bg-slate-100 text-slate-700", pending: "bg-amber-100 text-amber-950", needs_attention: "bg-rose-100 text-rose-900", not_connected: "bg-slate-100 text-slate-700" };
function CheckCard({ check }: { check: ReadinessCheck }) {
  return <li className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="font-[family-name:var(--font-display)] text-xl">{check.title}</h3><Badge variant="outline" className={tones[check.state]}>{labels[check.state]}</Badge></div>
    <p className="mt-3 text-sm leading-relaxed text-[color:var(--ink-soft)]">{check.detail}</p>
    {check.href && <Link href={check.href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4")}>{check.linkLabel || "Review setup"}</Link>}
  </li>;
}
function SetupWorkspace() {
  const searchParams = useSearchParams();
  const [selectedEntityId, setEntityId] = useState<string | null>(null);
  const entityId = selectedEntityId ?? searchParams.get("entity") ?? searchParams.get("brandId") ?? "";
  const [data, setData] = useState<CompanyGoLive | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/providers/company-readiness${entityId ? `?entityId=${encodeURIComponent(entityId)}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to check this company"); return body as CompanyGoLive; })
      .then(body => { if (!controller.signal.aborted) setData(body); })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to check this company"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [entityId, refresh]);
  function chooseCompany(id: string) {
    setLoading(true); setError(""); setEntityId(id);
    const url = new URL(window.location.href); url.searchParams.set("entity", id); url.searchParams.delete("brandId"); window.history.replaceState(null, "", url);
  }
  return <div>
    <PageHeader title="Go live" description="Check connections and launch readiness for one company at a time. Shared services do not automatically activate other companies." actions={<Link href={`/company-setup${data ? `?entity=${encodeURIComponent(data.company.id)}` : ""}`} className={cn(buttonVariants({ variant: "outline" }))}>Company setup</Link>} />
    <div className="mb-6 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid min-w-64 gap-2 text-sm font-medium">Company
          <select aria-label="Go live company" className="rounded-lg border border-[color:var(--ink-border)] bg-[color:var(--panel)] px-3 py-2" value={entityId || data?.company.id || ""} onChange={event => chooseCompany(event.target.value)} disabled={loading}>
            {(data?.companies || []).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
        <Button type="button" variant="outline" disabled={loading} onClick={() => { setLoading(true); setError(""); setRefresh(value => value + 1); }}>{loading ? "Checking connections…" : "Refresh status"}</Button>
      </div>
      <p className="mt-3 text-sm text-[color:var(--ink-muted)]">This page checks status only. It does not turn sending on, launch a campaign, or change any provider account.</p>
    </div>
    {loading ? <p role="status">Checking this company’s connections…</p> : error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">{error}</p> : data && <>
      <div className="mb-6"><h2 className="font-[family-name:var(--font-display)] text-2xl">{data.company.name}</h2><p className="text-sm text-[color:var(--ink-muted)]">{data.company.domain || "Company domain not added"} · Last checked {new Date(data.checkedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} New York time</p></div>
      <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl">Email & text readiness</h2>
      <ul className="mb-7 grid gap-3 lg:grid-cols-2">{data.messaging.map(check => <CheckCard key={check.id} check={check} />)}</ul>
      <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl">Website, social media & other connections</h2>
      <p className="mb-4 text-sm text-[color:var(--ink-muted)]">Company setup progress is shown separately from live messaging checks. Saved login details do not establish a live connection.</p>
      <ul className="mb-7 grid gap-3 lg:grid-cols-2">{data.connections.map(check => <CheckCard key={check.id} check={check} />)}</ul>
      <details className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5"><summary className="cursor-pointer font-medium">Shared platform services</summary><ul className="mt-4 grid gap-3 lg:grid-cols-2">{data.infrastructure.map(check => <CheckCard key={check.id} check={check} />)}</ul></details>
    </>}
  </div>;
}

export default function SetupPage() {
  return <Suspense fallback={<p>Loading company readiness…</p>}><SetupWorkspace /></Suspense>;
}
