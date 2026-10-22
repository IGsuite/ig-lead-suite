"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { usePlatform } from "@/hooks/use-platform";
import { PageHeader } from "@/components/page-header";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { Button } from "@/components/ui/button";
import { marketingPlatformLabels, readSearchSetup, writeSearchSetup, type SearchSetup } from "@/lib/marketing-platforms";
import type { Brand, SocialCampaign, SocialConnection } from "@/lib/types";

type SearchPlatform = "seo" | "google_ads";
const field = "w-full rounded-md border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2 text-sm";
const panel = "rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5";
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2 text-sm font-medium">{label}{children}</label>; }
async function save(body: object) {
  const response = await fetch("/api/social-campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not save");
}

export function SearchMarketingWorkspace({ platform, initialEntity }: { platform: SearchPlatform; initialEntity: string }) {
  const { data, loading, error, refresh } = usePlatform({ omitLeads: true });
  const router = useRouter();
  const [selectedEntity, setEntity] = useState(initialEntity);
  if (loading) return <LoadingPanel />;
  if (error || !data) return <ErrorPanel message={error || "Could not load workspace"} onRetry={refresh} />;
  const brand = data.brands.find(b => b.id === selectedEntity) || data.brands[0];
  if (!brand) return <p>No company portals are available.</p>;
  return <div className="space-y-5">
    <PageHeader title={marketingPlatformLabels[platform]} description="Plan and review this marketing channel separately for each company." />
    <Field label="Company"><select aria-label="Search marketing company" className={`${field} max-w-md`} value={brand.id} onChange={e => { setEntity(e.target.value); router.replace(`/social?entity=${encodeURIComponent(e.target.value)}&platform=${platform}`); }}>{data.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
    <SearchCompanyWorkspace key={`${brand.id}:${platform}`} brand={brand} platform={platform} connection={data.socialConnections?.find(c => c.entityId === brand.id && c.platform === platform)} campaigns={(data.socialCampaigns || []).filter(c => c.entityId === brand.id && c.platform === platform)} refresh={refresh} />
  </div>;
}

function SearchCompanyWorkspace({ brand, platform, connection, campaigns, refresh }: { brand: Brand; platform: SearchPlatform; connection?: SocialConnection; campaigns: SocialCampaign[]; refresh: () => Promise<void> }) {
  const [setup, setSetup] = useState<SearchSetup>(() => ({ ...readSearchSetup(connection?.notes), website: readSearchSetup(connection?.notes).website || brand.websiteUrl }));
  const [accountId, setAccountId] = useState(connection?.adAccountId || "");
  const [propertyId, setPropertyId] = useState(connection?.pixelOrEventsId || "");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<SocialCampaign | "new" | null>(null);
  const label = marketingPlatformLabels[platform];
  const change = (key: keyof SearchSetup, value: string) => setSetup(s => ({ ...s, [key]: value }));
  async function saveSetup(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      await save({ action: "upsert_connection", entityId: brand.id, platform, connectionStatus: "needs_setup", adAccountId: accountId, pixelOrEventsId: propertyId, connectionNotes: writeSearchSetup(setup) });
      toast.success(`${brand.shortName} ${label} setup details saved`); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Save failed"); }
    finally { setSaving(false); }
  }
  return <>
    <section className={panel}>
      <h2 className="font-[family-name:var(--font-display)] text-xl">{brand.shortName} · {label} connections</h2>
      <p className="mt-2 text-sm text-[color:var(--ink-muted)]">Live reporting is not connected in Lead Suite. Saving these details prepares this company’s setup. Results below are manually recorded; saving a plan does not publish ads, change a website, or spend money.</p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm underline">
        {platform === "seo" ? <><a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Open Search Console</a><a href="https://www.semrush.com/projects/" target="_blank" rel="noreferrer">Open Semrush projects</a><a href="https://business.google.com/" target="_blank" rel="noreferrer">Open Google Business Profile</a></> : <a href="https://ads.google.com/" target="_blank" rel="noreferrer">Open Google Ads</a>}
        <a href="https://analytics.google.com/" target="_blank" rel="noreferrer">Open Google Analytics</a>
      </div>
      <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={saveSetup}>
        <Field label="Company website"><input className={field} type="url" value={setup.website} onChange={e => change("website", e.target.value)} /></Field>
        <Field label={platform === "seo" ? "Semrush project / account reference" : "Google Ads customer ID"}><input className={field} value={accountId} onChange={e => setAccountId(e.target.value)} /></Field>
        <Field label="Search Console property"><input className={field} placeholder="sc-domain:example.com" value={propertyId} onChange={e => setPropertyId(e.target.value)} /></Field>
        <Field label="Google Analytics property ID"><input className={field} value={setup.analyticsId} onChange={e => change("analyticsId", e.target.value)} /></Field>
        <Field label="Competitor websites — one per line"><textarea className={field} rows={3} value={setup.competitors} onChange={e => change("competitors", e.target.value)} /></Field>
        <Field label="Target keywords — one per line"><textarea className={field} rows={3} value={setup.keywords} onChange={e => change("keywords", e.target.value)} /></Field>
        <Field label="Target locations / service areas"><input className={field} value={setup.locations} onChange={e => change("locations", e.target.value)} /></Field>
        <Field label="Research tool"><select className={field} value={setup.researchTool} onChange={e => change("researchTool", e.target.value)}><option>Semrush</option><option>Ahrefs</option><option>Keywords Everywhere</option><option>Other</option></select></Field>
        <Field label="Setup notes"><textarea className={field} rows={2} value={setup.notes} onChange={e => change("notes", e.target.value)} /></Field>
        <p className="self-center text-xs text-[color:var(--ink-muted)]">Use a separate project and account mapping for each company. Enter passwords and API keys only in the provider’s secure connection screen.</p>
        <div><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save setup details"}</Button></div>
      </form>
    </section>
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-[family-name:var(--font-display)] text-xl">{label} plans & results</h2><Button onClick={() => setEditing("new")}>Create {platform === "seo" ? "SEO plan" : "Google Ads plan"}</Button></div>
      <p className="mt-2 text-sm text-[color:var(--ink-muted)]">Dates appear in the main calendar as plans. Metrics are manual totals for the plan’s date range, not live provider results.</p>
      {editing ? <SearchPlanForm key={typeof editing === "string" ? "new" : editing.id} brand={brand} platform={platform} campaign={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }} /> : null}
      {campaigns.length ? <div className="mt-4 space-y-3">{campaigns.map(c => <article key={c.id} className="rounded-lg border border-[color:var(--ink-border)] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{c.name}</h3><p className="mt-1 text-sm">{c.status} · {c.scheduleStart?.slice(0, 10) || "No start date"} – {c.scheduleEnd?.slice(0, 10) || "No end date"}</p></div><Button variant="outline" size="sm" onClick={() => setEditing(c)}>Edit plan</Button></div><p className="mt-2 text-sm">{c.objective}</p><p className="mt-2 text-xs text-[color:var(--ink-muted)]">Manual results: {c.impressions.toLocaleString()} impressions · {c.clicks.toLocaleString()} clicks · {c.leads.toLocaleString()} leads{platform === "google_ads" ? ` · $${(c.spendCents / 100).toFixed(2)} spend` : ""}</p></article>)}</div> : <p className="mt-4 text-sm">No {label} plans saved for {brand.shortName} yet.</p>}
      <Link className="mt-4 inline-block text-sm underline" href={`/calendar?brandId=${encodeURIComponent(brand.id)}`}>View company marketing calendar</Link>
    </section>
  </>;
}

function SearchPlanForm({ brand, platform, campaign, onCancel, onSaved }: { brand: Brand; platform: SearchPlatform; campaign?: SocialCampaign; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true);
    try {
      await save({ action: campaign ? "update" : undefined, id: campaign?.id, entityId: brand.id, platform, name: form.get("name"), objective: form.get("objective"), status: form.get("status"), landingUrl: form.get("landingUrl"), targetingNotes: form.get("targetingNotes"), notes: form.get("notes"), scheduleStart: form.get("start") || null, scheduleEnd: form.get("end") || null, impressions: Number(form.get("impressions")), clicks: Number(form.get("clicks")), leads: Number(form.get("leads")), ...(platform === "google_ads" ? { spendDollars: form.get("spend"), dailyBudgetDollars: form.get("budget") || null } : {}) });
      toast.success("Plan saved; no advertising was launched"); await onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Save failed"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-5 grid gap-4 rounded-lg border border-[color:var(--ink-border)] p-4 md:grid-cols-2">
    <Field label="Plan name"><input className={field} name="name" required defaultValue={campaign?.name || ""} /></Field>
    <Field label="Status"><select className={field} name="status" defaultValue={campaign?.status === "archived" ? "archived" : campaign?.status === "paused" ? "paused" : "draft"}><option value="draft">Draft</option><option value="paused">Paused</option><option value="archived">Archived</option></select></Field>
    <Field label="Goal / program"><input className={field} name="objective" defaultValue={campaign?.objective || ""} placeholder="e.g. HELOC search visibility" /></Field>
    <Field label="Landing page"><input className={field} name="landingUrl" type="url" defaultValue={campaign?.landingUrl || brand.websiteUrl} /></Field>
    <Field label="Start date"><input className={field} name="start" type="date" defaultValue={campaign?.scheduleStart?.slice(0, 10) || ""} /></Field>
    <Field label="End date"><input className={field} name="end" type="date" defaultValue={campaign?.scheduleEnd?.slice(0, 10) || ""} /></Field>
    <Field label="Keywords, locations & competitor research"><textarea className={field} name="targetingNotes" rows={3} defaultValue={campaign?.targetingNotes || ""} /></Field>
    <Field label="Website improvements / results source"><textarea className={field} name="notes" rows={3} defaultValue={campaign?.notes || ""} placeholder="Record the source, reporting dates and proposed website work." /></Field>
    {(["impressions", "clicks", "leads"] as const).map(key => <Field key={key} label={`Manual ${key}`}><input className={field} type="number" min="0" step="1" name={key} defaultValue={campaign?.[key] || 0} /></Field>)}
    {platform === "google_ads" ? <><Field label="Manual spend (USD)"><input className={field} type="number" min="0" step="0.01" name="spend" defaultValue={(campaign?.spendCents || 0) / 100} /></Field><Field label="Planned daily budget (USD)"><input className={field} type="number" min="0" step="0.01" name="budget" defaultValue={campaign?.dailyBudgetCents == null ? "" : campaign.dailyBudgetCents / 100} /></Field></> : null}
    <div className="flex items-end gap-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save draft plan"}</Button><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button></div>
  </form>;
}
