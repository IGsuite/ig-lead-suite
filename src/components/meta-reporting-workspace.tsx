"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import type { MetaSnapshot } from "@/lib/meta-reporting";

type Connection = {
  state: string; revision: number; snapshot: MetaSnapshot | null;
  supported?: boolean; company?: string; isAdmin?: boolean; vaultConfigured?: boolean;
};
const labels: Record<string, string> = { not_connected: "Not connected", disconnected: "Disconnected", verified: "Access verified", expired: "Access expired", needs_attention: "Connection needs attention", stale: "Check connection", needs_setup: "Company setup needed" };
const panel = "rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5";
const field = "rounded-lg border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2";

export function MetaReportingWorkspace({ entityId }: { entityId: string }) {
  const [data, setData] = useState<Connection | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [accessToken, setAccessToken] = useState(""), [appSecret, setAppSecret] = useState(""), [adAccountId, setAdAccountId] = useState(""), [approved, setApproved] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/integrations/meta?entityId=${encodeURIComponent(entityId)}`, { cache: "no-store", signal: controller.signal }).then(async r => {
      const result = await r.json(); if (!r.ok) throw Error(result.error || "Could not load the connection.");
      if (!controller.signal.aborted) { setData(result); setAdAccountId(result.snapshot?.adAccount?.id || ""); }
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load the connection."); });
    return () => controller.abort();
  }, [entityId]);
  async function act(action: "connect" | "refresh" | "disconnect", event?: React.FormEvent) {
    event?.preventDefault(); if (!data || busy || action === "connect" && !approved) return;
    if (action === "disconnect" && !window.confirm("Clear this company's stored Meta token and app secret? Historical reports remain. Revoke the system-user access in Meta separately.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = { action, entityId, revision: data.revision, ...(action === "connect" ? { accessToken, appSecret, ...(adAccountId.trim() ? { adAccountId: adAccountId.trim() } : {}), approvedScope: "meta_reporting_only" } : {}) };
      const r = await fetch("/api/integrations/meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await r.json();
      if (!r.ok) {
        // A failed refresh may have marked the saved report as needing attention.
        const state = await fetch(`/api/integrations/meta?entityId=${encodeURIComponent(entityId)}`, { cache: "no-store" });
        if (state.ok) setData(await state.json());
        throw Error(result.error || "The connection could not be updated.");
      }
      setData(previous => ({ ...previous!, ...result }));
      setNotice(action === "disconnect" ? "Stored credentials cleared. Remove the access in Meta as well." : "Meta access checked. The dated report below is saved in Lead Suite.");
    } catch (e) { setError(e instanceof Error ? e.message : "The connection could not be updated."); }
    finally { setBusy(false); setAccessToken(""); setAppSecret(""); setApproved(false); }
  }
  const snapshot = data?.snapshot;
  return <div className="space-y-5">
    <PageHeader title="Meta reporting" description={data?.company ? `${data.company} · Facebook Page access and business ad reporting.` : "Verify a company's Meta connection and review its saved reports."} actions={<Link className={buttonVariants({ variant: "outline" })} href={`/company-setup?entity=${encodeURIComponent(entityId)}#facebook`}>Company setup</Link>} />
    {error && <p role="alert" className="rounded-lg border border-rose-300 p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {!data && !error && <p>Loading connection…</p>}
    {data && <section className={`${panel} space-y-3`}>
      <h2 className="text-lg font-medium">{labels[data.state] || "Check connection"}</h2>
      <p className="text-sm">This connection reads company account information and ad reports. Publishing ads, posting content and inbox synchronization are not enabled here.</p>
      {data.supported === false && <p className="text-sm">This company’s Meta accounts still need to be confirmed in Company setup.</p>}
      {snapshot && <>
        <p className="text-sm">Access last checked: {new Date(snapshot.checkedAt).toLocaleString()}. Expires: {new Date(snapshot.expiresAt).toLocaleString()}.</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-[color:var(--ink-muted)]">Facebook Page</dt><dd>{snapshot.page.name} · {snapshot.page.id}</dd></div>
          <div><dt className="text-[color:var(--ink-muted)]">Instagram account</dt><dd>{snapshot.instagram ? `@${snapshot.instagram.username}` : "Not verified through this connection"}</dd></div>
          <div><dt className="text-[color:var(--ink-muted)]">Business ad account</dt><dd>{snapshot.adAccount ? `${snapshot.adAccount.name} · ${snapshot.adAccount.id}` : "Not connected"}</dd></div>
        </dl>
        {data.isAdmin && <div className="flex flex-wrap gap-3"><Button type="button" disabled={busy} variant="outline" onClick={() => void act("refresh")}>Refresh from Meta</Button><Button type="button" disabled={busy} variant="outline" onClick={() => void act("disconnect")}>Disconnect locally</Button></div>}
      </>}
    </section>}
    {snapshot?.adAccount && <section className={`${panel} space-y-3`}>
      <h2 className="text-lg font-medium">Last 30 days · saved ad report</h2>
      <p className="text-sm text-[color:var(--ink-muted)]">Snapshot read on {new Date(snapshot.checkedAt).toLocaleString()}{snapshot.report ? ` · ${snapshot.report.dateStart} to ${snapshot.report.dateStop}` : " · Meta returned no delivery data for this period"}. Account status code: {snapshot.adAccount.accountStatus}.</p>
      {snapshot.report && <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div><dt>Impressions</dt><dd className="text-xl tabular-nums">{snapshot.report.impressions.toLocaleString()}</dd></div>
        <div><dt>Clicks</dt><dd className="text-xl tabular-nums">{snapshot.report.clicks.toLocaleString()}</dd></div>
        <div><dt>Reach</dt><dd className="text-xl tabular-nums">{snapshot.report.reach.toLocaleString()}</dd></div>
        <div><dt>Spend</dt><dd className="text-xl tabular-nums">{new Intl.NumberFormat(undefined, { style: "currency", currency: snapshot.adAccount.currency }).format(snapshot.report.spend)}</dd></div>
      </dl>}
    </section>}
    {data?.isAdmin && data.supported && <details className={panel} open={!snapshot}>
      <summary className="cursor-pointer font-medium">{snapshot ? "Replace Meta credentials" : "Connect Meta reporting"}</summary>
      <p className="mt-3 text-sm">Use the owner-approved company system-user token and the Lead Suite Marketing app secret. Both are stored encrypted and used only on the server. Existing account passwords are kept separately.</p>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" autoComplete="off" onSubmit={e => void act("connect", e)}>
        <label className="grid gap-2 text-sm sm:col-span-2">Company system-user token<input className={field} type="password" autoComplete="off" required minLength={40} maxLength={8000} value={accessToken} disabled={busy} onChange={e => setAccessToken(e.target.value)} /></label>
        <label className="grid gap-2 text-sm">Meta app secret<input className={field} type="password" autoComplete="off" required pattern="[a-fA-F0-9]{32}" value={appSecret} disabled={busy} onChange={e => setAppSecret(e.target.value)} /></label>
        <label className="grid gap-2 text-sm">Business ad account ID — optional<input className={field} inputMode="numeric" pattern="[0-9]{8,32}" value={adAccountId} disabled={busy} onChange={e => setAdAccountId(e.target.value)} /></label>
        <p className="text-sm text-[color:var(--ink-muted)] sm:col-span-2">The expected Abstract Page and ad-account business ownership are checked before saving. Leave the ad account blank until its setup is complete.</p>
        <label className="flex items-start gap-3 text-sm sm:col-span-2"><input type="checkbox" checked={approved} disabled={busy} onChange={e => setApproved(e.target.checked)} />I authorize encrypted credential storage and report reads for this company. This does not authorize publishing, message sending or ad spending.</label>
        <div className="sm:col-span-2"><Button type="submit" disabled={busy || !approved || !data.vaultConfigured}>{busy ? "Checking Meta…" : "Verify and save connection"}</Button>{!data.vaultConfigured && <p className="mt-2 text-sm">Protected account storage must be configured first.</p>}</div>
      </form>
    </details>}
  </div>;
}
