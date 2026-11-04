"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import type { TiktokSnapshot } from "@/lib/tiktok-reporting";
type State = { supported?: boolean; isAdmin?: boolean; vaultConfigured?: boolean; state: string; revision: number; snapshot: TiktokSnapshot | null; automaticRefreshEnabled?: boolean };
const labels: Record<string,string> = { not_connected:"Reporting not connected", disconnected:"Disconnected", verified:"Reporting verified", needs_attention:"Connection needs attention", stale:"Report needs refreshing", needs_setup:"Company setup needed" };
export function TiktokReportingWorkspace({ entityId }: { entityId: string }) {
  const [data,setData] = useState<State|null>(null), [error,setError] = useState(""), [notice,setNotice] = useState("");
  const [busy,setBusy] = useState(false), [apiKey,setApiKey] = useState(""), [approved,setApproved] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/integrations/tiktok-report?entityId=${encodeURIComponent(entityId)}`, {cache:"no-store",signal:controller.signal}).then(async r => {
      const result = await r.json(); if (!r.ok) throw Error(result.error || "Could not load TikTok reporting.");
      if (!controller.signal.aborted) setData(result);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load TikTok reporting."); });
    return () => controller.abort();
  },[entityId]);
  async function act(action:"connect"|"refresh"|"disconnect", event?:React.FormEvent) {
    event?.preventDefault(); if (!data || busy || action === "connect" && !approved) return;
    if (action === "disconnect" && !window.confirm("Clear the saved Windsor key and stop local TikTok report refreshes? Revoke access in Windsor separately.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/integrations/tiktok-report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entityId,action,revision:data.revision,...(action === "connect" ? {apiKey,approvedScope:"abstract_tiktok_reporting_daily"} : {})})});
      const result = await r.json();
      if (!r.ok) {
        const state = await fetch(`/api/integrations/tiktok-report?entityId=${encodeURIComponent(entityId)}`,{cache:"no-store"});
        if (state.ok) setData(await state.json());
        throw Error(result.error || "Could not update TikTok reporting.");
      }
      setData(previous => ({...previous!,...result}));
      setNotice(action === "disconnect" ? "Stored key cleared. Revoke access in Windsor separately." : "Abstract's TikTok account totals were checked and saved.");
    } catch(e) { setError(e instanceof Error ? e.message : "Could not update TikTok reporting."); }
    finally { setBusy(false); setApiKey(""); setApproved(false); }
  }
  const snapshot = data?.snapshot;
  return <div className="space-y-5">
    <PageHeader title="TikTok reporting" description="Read-only account totals through Windsor. Advertising and publishing remain inactive." actions={<Link href={`/company-setup?entity=${encodeURIComponent(entityId)}#tiktok`}>Company setup</Link>} />
    {error && <p role="alert" className="rounded-lg border border-rose-300 p-3">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p>Loading connection…</p>}
    {data && <section className="space-y-4 rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
      <h2 className="text-lg font-medium">{labels[data.state] || "Check connection"}</h2>
      {data.supported === false ? <p>This company’s TikTok account must be confirmed before its reporting can be connected.</p> : <>
        <p>Abstract Capital Group · <a href="https://www.tiktok.com/@abstractcapitalgroup" target="_blank" rel="noreferrer" className="underline">@abstractcapitalgroup</a></p>
        <p className="text-sm">Connected reports refresh during the daily connection check. Failures appear in Alerts &amp; Tasks. Totals are dated snapshots, not live activity tracking.</p>
        {snapshot && <>
          <p className="text-sm">Provider data: {new Date(snapshot.fetchedAt).toLocaleString()}. Last checked: {new Date(snapshot.checkedAt).toLocaleString()}.</p>
          <dl className="grid gap-4 sm:grid-cols-4">{[["Followers",snapshot.followers],["Following",snapshot.following],["Total likes",snapshot.likes],["Videos",snapshot.videos]].map(([label,value]) => <div key={label}><dt className="text-sm text-[color:var(--ink-muted)]">{label}</dt><dd className="text-2xl font-medium">{Number(value).toLocaleString()}</dd></div>)}</dl>
          <p className="text-sm">TikTok account type: {snapshot.businessAccount ? "Business" : "Personal — Business account setup still needed for business features"}.</p>
        </>}
        {data.isAdmin && <div className="flex flex-wrap gap-3"><Button disabled={busy || !data.automaticRefreshEnabled} variant="outline" onClick={() => void act("refresh")}>Refresh report</Button><Button disabled={busy || !data.automaticRefreshEnabled} variant="outline" onClick={() => void act("disconnect")}>Disconnect locally</Button></div>}
        {data.isAdmin && <details><summary className="cursor-pointer">Connect or replace the reporting key</summary><form onSubmit={e => void act("connect",e)} className="mt-4 max-w-xl space-y-4">
          <p className="text-sm">Use the Windsor workspace where only Abstract’s TikTok account is selected for this connection. A workspace key may also grant access to its other sources; use a dedicated workspace when separation is required. Lead Suite encrypts the key and makes fixed TikTok read requests only.</p>
          <label className="block">Windsor API key<input type="password" autoComplete="off" required minLength={8} maxLength={512} value={apiKey} onChange={e => setApiKey(e.target.value)} className="mt-1 block w-full rounded-md border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2" /></label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />I approve storing this key for Abstract’s daily TikTok reporting and connection checks. No posting or advertising is enabled.</label>
          <Button disabled={busy || !approved || !data.vaultConfigured}>Verify and save reporting connection</Button>
        </form></details>}
      </>}
    </section>}
  </div>;
}
