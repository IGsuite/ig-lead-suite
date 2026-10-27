"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
type Data={companies:{id:string;name:string}[];items:{id:string;kind:string;entityId:string;message:string;href:string;createdAt:string}[];needsOwner:number};
export function AlertsWorkspace(){
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[company,setCompany]=useState("all"),[busy,setBusy]=useState("");
  const load=useCallback(async()=>{try{const r=await fetch("/api/alerts",{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"Could not load alerts");setData(d);setError("");}catch(e){setError(e instanceof Error?e.message:"Could not load alerts");}},[]);
  // load awaits the network before updating state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),60000);return ()=>clearInterval(timer);},[load]);
  async function acknowledge(id:string,kind:string){setBusy(id);try{const r=await fetch("/api/alerts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,kind})});if(!r.ok)throw Error("Could not acknowledge alert");await load();window.dispatchEvent(new Event("alerts-updated"));}catch(e){setError(e instanceof Error?e.message:"Update failed");}finally{setBusy("");}}
  return <div className="space-y-5"><PageHeader title="Alerts & Tasks" description="Review delivery issues, company setup updates and SEO reports. Acknowledging an alert clears it for the team; it does not close its underlying task."/>
    <div className="flex flex-wrap gap-4 text-sm underline"><Link href="/company-setup">Open company checklists</Link><button onClick={()=>void load()}>Refresh alerts</button></div>
    {error?<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>:null}
    {data?<><p className="text-sm">{data.needsOwner} setup item{data.needsOwner===1?"":"s"} need owner help. External IGF Ventures routing is not connected yet.</p><label className="grid max-w-md gap-1 text-sm">Company<select className="rounded-md border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2" value={company} onChange={e=>setCompany(e.target.value)}><option value="all">All assigned companies</option>{data.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {data.items.filter(i=>company==="all"||i.entityId===company).map(item=><article key={item.id} className="rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4"><p className="text-xs text-[color:var(--ink-muted)]">{data.companies.find(c=>c.id===item.entityId)?.name} · {item.kind==="seo"?"SEO report":item.kind==="delivery"?"Delivery issue":"Company setup"} · {new Date(item.createdAt).toLocaleString()}</p><p className="my-2 text-sm">{item.message}</p><div className="flex gap-4"><Link className="self-center text-sm underline" href={item.href}>Open related work</Link><Button variant="outline" size="sm" disabled={busy===item.id} onClick={()=>void acknowledge(item.id,item.kind)}>Acknowledge for team</Button></div></article>)}{!data.items.some(i=>company==="all"||i.entityId===company)?<p>No unacknowledged updates for this view.</p>:null}</>:<p>Loading alerts…</p>}
  </div>;
}
