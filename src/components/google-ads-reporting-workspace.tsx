"use client";
import { useEffect,useState } from "react";
import { Button } from "@/components/ui/button";
import type { GoogleReport } from "@/lib/google-ads-reporting";
type State={state:string;revision:number;expiresAt?:string;receivedAt?:string;report:GoogleReport|null;isAdmin:boolean;vaultConfigured:boolean};
const labels:Record<string,string>={not_connected:"Not connected",awaiting_report:"Waiting for Google report",receiving_reports:"Receiving reports",stale:"Report overdue",expired:"Report key expired",revoked:"Disconnected"};
export function GoogleAdsReportingWorkspace({entityId}:{entityId:string}) {
 const [data,setData]=useState<State|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[script,setScript]=useState(""),[approved,setApproved]=useState(false);
 useEffect(()=>{const controller=new AbortController();if(entityId!=="abstract")return;void fetch(`/api/integrations/google-ads-report?entityId=abstract`,{cache:"no-store",signal:controller.signal}).then(async r=>{const result=await r.json();if(!r.ok)throw Error(result.error);if(!controller.signal.aborted)setData(result);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load reporting");});return()=>controller.abort();},[entityId]);
 async function refresh(){setBusy(true);setError("");try{const r=await fetch('/api/integrations/google-ads-report?entityId=abstract',{cache:"no-store"});const result=await r.json();if(!r.ok)throw Error(result.error);setData(result);}catch(e){setError(e instanceof Error?e.message:"Could not load report");}finally{setBusy(false);}}
 async function change(action:"create"|"revoke") {if(!data)return;setBusy(true);setError("");setScript("");try{const r=await fetch('/api/integrations/google-ads-report',{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entityId:"abstract",action,revision:data.revision,approvedScope:"google_ads_reports_only"})});const result=await r.json();if(!r.ok)throw Error(result.error);setScript(result.script||"");setApproved(false);await refresh();}catch(e){setError(e instanceof Error?e.message:"Could not change connection");}finally{setBusy(false);}}
 function download(){const url=URL.createObjectURL(new Blob([script],{type:"text/javascript"}));const a=document.createElement("a");a.href=url;a.download="abstract-google-ads-report.js";a.click();URL.revokeObjectURL(url);}
 if(entityId!=="abstract")return null;
 const total=data?.report?.campaigns.reduce((sum,c)=>({impressions:sum.impressions+c.impressions,clicks:sum.clicks+c.clicks,costMicros:sum.costMicros+c.costMicros,conversions:sum.conversions+c.conversions}),{impressions:0,clicks:0,costMicros:0,conversions:0});
 return <section className="space-y-4 rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
  <h2 className="text-xl font-medium">Google Ads · automatic reports</h2>
  <p className="text-sm">Abstract account 420-997-5325. A scheduled report in your Google Ads account sends campaign results here. It does not change ads, audiences or budgets.</p>
  {error&&<p role="alert" className="text-sm">{error}</p>}
  <p role="status" className="font-medium">{data?labels[data.state]||data.state:"Loading report connection…"}</p>
  {data?.receivedAt&&<p className="text-sm">Last received: {new Date(data.receivedAt).toLocaleString()}. Reported results are a dated snapshot; Google may adjust attribution later.</p>}
  {data?.report&&total&&<>
   <p className="text-sm">{data.report.dateStart} – {data.report.dateEnd} · {data.report.timeZone} · {data.report.campaigns.length} campaigns</p>
   <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4"><div><dt>Impressions</dt><dd className="text-xl">{total.impressions.toLocaleString()}</dd></div><div><dt>Clicks</dt><dd className="text-xl">{total.clicks.toLocaleString()}</dd></div><div><dt>Spend</dt><dd className="text-xl">{new Intl.NumberFormat(undefined,{style:"currency",currency:"USD"}).format(total.costMicros/1_000_000)}</dd></div><div><dt>Reported conversions</dt><dd className="text-xl">{total.conversions.toLocaleString()}</dd></div></dl>
   <p className="text-xs text-[color:var(--ink-muted)]">A conversion count does not confirm that application tracking has been tested. Review the actual successful-application event separately.</p>
   <ul className="space-y-2 text-sm">{data.report.campaigns.map(c=><li className="rounded-md border border-[color:var(--ink-border)] p-3" key={c.id}>{c.name} · {c.status} · {c.clicks.toLocaleString()} clicks · {(c.costMicros/1_000_000).toLocaleString(undefined,{style:"currency",currency:"USD"})} · {c.conversions.toLocaleString()} conversions</li>)}</ul>
  </>}
  <Button variant="outline" disabled={busy} onClick={()=>void refresh()}>Check for new report</Button>
  {data?.isAdmin&&<details><summary className="cursor-pointer text-sm font-medium">Set up or replace Google reporting</summary><div className="mt-3 space-y-3 text-sm">
   <p>Create a 90-day key, install the generated script in Abstract&apos;s Google Ads account under Tools → Bulk actions → Scripts, authorize it in Google, run it once and schedule it daily. Google&apos;s authorization screen may grant broader script capabilities; this script only reads reports. A new key replaces the old key. Keep the generated script private.</p>
   {data.expiresAt&&<p>Key expires: {new Date(data.expiresAt).toLocaleString()}.</p>}
   <label className="flex gap-3"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} disabled={busy}/>I approve 90-day access to send Abstract Google Ads reports into Lead Suite. This does not authorize ad changes or spending.</label>
   <div className="flex flex-wrap gap-3"><Button disabled={busy||!approved||!data.vaultConfigured} onClick={()=>void change("create")}>Create reporting script</Button>{data.state!=="not_connected"&&<Button variant="outline" disabled={busy||!approved} onClick={()=>void change("revoke")}>Revoke report key</Button>}</div>
   {script&&<div className="space-y-3"><p>Script ready. It contains a private report key and is available only in this view.</p><Button onClick={download}>Download private reporting script</Button><Button variant="outline" onClick={()=>setScript("")}>Clear script from this page</Button></div>}
  </div></details>}
 </section>;
}
