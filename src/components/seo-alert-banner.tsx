"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
export function SeoAlertBanner(){
  const [alerts,setAlerts]=useState<{id:string;entityId:string;message:string;href:string}[]>([]);
  useEffect(()=>{
    let active=true;
    async function check(){try{const r=await fetch("/api/alerts",{cache:"no-store"});if(r.ok){const d=await r.json();if(active)setAlerts(d.items||[]);}}catch{/* The page remains usable if notification polling is unavailable. */}}
    void check();const timer=setInterval(()=>void check(),60000);window.addEventListener("alerts-updated",check);return ()=>{active=false;clearInterval(timer);window.removeEventListener("alerts-updated",check);};
  },[]);
  return <details className="relative"><summary aria-label={`Notifications: ${alerts.length} outstanding`} className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-[color:var(--ink-border)] bg-[color:var(--panel)] px-3 py-2 text-sm"><Bell aria-hidden="true" className="size-4" /><span>{alerts.length}</span><span className="sr-only">outstanding notifications</span></summary><div className="absolute right-0 top-full z-40 mt-2 w-[min(23rem,85vw)] rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4"><p className="mb-3 font-medium">Alerts &amp; notices</p>{alerts.length ? <ul className="max-h-72 divide-y divide-[color:var(--ink-border)] overflow-auto">{alerts.slice(0,5).map(alert=><li key={alert.id} className="py-3 text-sm"><Link href={alert.href} className="hover:underline">{alert.message}</Link></li>)}</ul> : <p className="text-sm text-[color:var(--ink-muted)]">No outstanding notices.</p>}<Link className="mt-3 inline-block text-sm underline" href="/alerts">View all alerts &amp; tasks</Link></div></details>;
}
