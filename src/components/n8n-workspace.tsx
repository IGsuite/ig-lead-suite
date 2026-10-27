"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";

type Connection = {
  companies: { id: string; name: string }[]; entityId: string;
  setup?: { profileUrl: string; loginUrl: string } | null;
  state: string; expiresAt?: string; revision: number; isAdmin: boolean; vaultConfigured: boolean;
  recent: { id: string; message: string; createdAt: string }[]; lastTestAt?: string;
};
const panel = "rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5";
const labels: Record<string, string> = { not_connected: "Not connected", awaiting_test: "Key prepared — awaiting n8n test", tested: "Connection tested — workflow notices only", revoked: "Connection revoked", expired: "Connection key expired" };
export function N8nWorkspace() {
  const [entity, setEntity] = useState("abstract"), [data, setData] = useState<Connection | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(""), [secret, setSecret] = useState<{ company: string; value: string } | null>(null), [notice, setNotice] = useState("");
  const requestNumber = useRef(0);
  const load = useCallback(async () => {
    const number = ++requestNumber.current;
    try {
      const r = await fetch(`/api/integrations/n8n?entityId=${encodeURIComponent(entity)}`, { cache: "no-store" });
      const result = await r.json(); if (!r.ok) throw Error(result.error || "Connection information unavailable");
      if (number === requestNumber.current) { setData(result); setError(""); }
    } catch (e) { if (number === requestNumber.current) setError(e instanceof Error ? e.message : "Could not load connection"); }
  }, [entity]);
  useEffect(() => { const value = new URLSearchParams(window.location.search).get("entity"); if (value) queueMicrotask(() => setEntity(value)); }, []);
  // Network responses update the page, including after an external n8n connection test.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30000); return () => clearInterval(timer); }, [load]);
  useEffect(() => {
    if (!secret) return;
    const timer = setTimeout(() => setSecret(null), 120000), hide = () => { if (document.hidden) setSecret(null); };
    document.addEventListener("visibilitychange", hide); return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", hide); };
  }, [secret]);
  const current = data?.entityId === entity ? data : null;
  const permissionKey = `${entity}:${current?.revision || 0}`;
  async function change(action: "create" | "revoke") {
    if (!current || approved !== permissionKey) return;
    setBusy(true); setError(""); setSecret(null); setNotice("");
    try {
      const r = await fetch("/api/integrations/n8n", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityId: entity, action, revision: current.revision, approvedScope: "workflow_reports_only" }) });
      const result = await r.json(); if (!r.ok) throw Error(result.error || "Could not change connection");
      if (result.token) setSecret({ company: entity, value: result.token });
      setApproved(""); setNotice(action === "create" ? "Connection key created. Import the test workflow into your marketing n8n and attach this key as a credential." : "Access revoked. The previous key no longer works.");
      await load(); window.dispatchEvent(new Event("alerts-updated"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save connection"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <PageHeader title="Marketing workflows · n8n" description="A dedicated workflow connection for Lead Suite. Your main command center remains separate." actions={<Link className={buttonVariants({ variant: "outline" })} href={`/company-setup?entity=${entity}#n8n`}>Company setup</Link>} />
    <label className="grid max-w-sm gap-2 text-sm">Company<select aria-label="Workflow company" className="rounded-lg border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2" value={entity} disabled={busy} onChange={e => { setEntity(e.target.value); setSecret(null); setApproved(""); setNotice(""); history.replaceState(null, "", `/marketing-workflows?entity=${encodeURIComponent(e.target.value)}`); }}>
      {(data?.companies || [{ id: entity, name: entity }]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select></label>
    {error && <p role="alert" className="rounded-lg border border-rose-300 p-3 text-sm">{error}</p>}
    {current ? <>
      <section className={`${panel} space-y-3`}><h2 className="text-lg font-medium">{labels[current.state] || "Check connection"}</h2>
        <p className="text-sm">This connection can receive company-specific workflow notices. It cannot read leads, change verification, launch campaigns, send messages or access your command center.</p>
        {current.lastTestAt && <p className="text-sm">Last connection test: {new Date(current.lastTestAt).toLocaleString()}</p>}
        {current.expiresAt && <p className="text-sm text-[color:var(--ink-muted)]">Key expires: {new Date(current.expiresAt).toLocaleDateString()}</p>}
        <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => void load()}>Refresh connection</Button>{current.setup?.profileUrl && <a href={current.setup.profileUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>Open marketing n8n</a>}</div>
        {!current.setup?.profileUrl && <p className="text-sm">Still needed: the dedicated marketing n8n workspace link. Add it under Company setup → n8n.</p>}
      </section>
      <section className={`${panel} space-y-4`}><h2 className="text-lg font-medium">Connect the marketing workspace</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm"><li>Use the n8n workspace dedicated to Lead Suite marketing. Keep its workflows and credentials separate from IGF Ventures.</li><li>Download the connection test below and import it into that n8n workspace.</li><li>The owner can create a company-specific connection key below. Save it in an n8n credential, then run the imported test manually.</li><li>Refresh here to confirm the test arrived. Verification and sending remain off.</li></ol>
        <div className="flex flex-wrap gap-3"><a className={buttonVariants({ variant: "outline" })} href={`/api/integrations/n8n?entityId=${encodeURIComponent(entity)}&download=test`}>Download connection-test workflow</a><a className={buttonVariants({ variant: "outline" })} href={`/api/integrations/n8n?entityId=${encodeURIComponent(entity)}&download=errors`}>Download failure-notice workflow</a></div>
        <details className="text-sm"><summary className="cursor-pointer underline">Connection instructions for setup</summary><p className="mt-3">On the report node, select an HTTP Header Auth credential. Header name: Authorization. Value: Bearer followed by a space and this company’s key. Select the failure-notice workflow as the error workflow in your marketing workflows’ settings. Workflow files contain no credentials.</p><p className="mt-2">Keys expire after 90 days. Replacing a key immediately invalidates its predecessor. A test confirms only that notices can reach Lead Suite.</p></details>
        {current.isAdmin ? <div className="space-y-3 border-t border-[color:var(--ink-border)] pt-4">
          {!current.vaultConfigured && <p className="text-sm">Protected storage must be configured before creating a connection key.</p>}
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" aria-label="Approve workflow notice access" checked={approved === permissionKey} onChange={e => setApproved(e.target.checked ? permissionKey : "")} />I authorize this company’s marketing n8n to post workflow notices only. Creating a key replaces previous access; it does not connect leads or authorize spending or sending.</label>
          <div className="flex flex-wrap gap-3"><Button type="button" disabled={busy || !current.vaultConfigured || approved !== permissionKey} onClick={() => void change("create")}>{current.revision ? "Replace connection key" : "Create connection key"}</Button>{current.revision > 0 && current.state !== "revoked" && <Button type="button" variant="outline" disabled={busy || approved !== permissionKey} onClick={() => void change("revoke")}>Revoke access</Button>}</div>
          {secret?.company === entity && <div className="space-y-2"><label className="grid gap-1 text-sm">New connection key — copy now; hides after two minutes<input aria-label="New connection key" className="rounded-lg border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2" type="password" readOnly value={secret.value} autoComplete="off" /></label><Button type="button" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(secret.value); setNotice("Connection key copied. Save it in the company’s n8n credential."); } catch { setError("Could not copy. Select the key field and copy it directly."); } }}>Copy key</Button><Button type="button" variant="ghost" onClick={() => setSecret(null)}>Hide key</Button></div>}
          {notice && <p role="status" className="text-sm">{notice}</p>}
        </div> : <p className="text-sm">An administrator must create or revoke connection access.</p>}
      </section>
      <section className={panel}><h2 className="mb-3 text-lg font-medium">Workflow rollout</h2><ul className="space-y-3 text-sm"><li><strong>Connection and failure notices:</strong> ready to connect and test using the downloads above.</li><li><strong>Email and phone verification:</strong> next stage; provider access, costs, upload handoff and result checks still need configuration. It is not running.</li><li><strong>SEO reports and AI content:</strong> later workflows, after their source connections are available.</li><li><strong>IGF Ventures:</strong> a later, separately authorized handoff. No connection is created here.</li></ul></section>
      <section className={panel}><h2 className="mb-3 text-lg font-medium">Recent workflow notices</h2>{current.recent.length ? <ul className="space-y-3 text-sm">{current.recent.map(item => <li key={item.id}><p>{item.message}</p><span className="text-xs text-[color:var(--ink-muted)]">{new Date(item.createdAt).toLocaleString()}</span></li>)}</ul> : <p className="text-sm text-[color:var(--ink-muted)]">No n8n workflow notices received yet.</p>}</section>
    </> : !error && <p>Loading workflow connection…</p>}
  </div>;
}
