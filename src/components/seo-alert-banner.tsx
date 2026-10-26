"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export function SeoAlertBanner(){
  const [alerts,setAlerts]=useState<{id:string;entityId:string;message:string}[]>([]);
  useEffect(()=>{
    let active=true;
    async function check(){try{const r=await fetch("/api/seo?summary=1",{cache:"no-store"});if(r.ok){const d=await r.json();if(active)setAlerts(d.alerts||[]);}}catch{/* The page remains usable if notification polling is unavailable. */}}
    void check();const timer=setInterval(()=>void check(),60000);return ()=>{active=false;clearInterval(timer);};
  },[]);
  if(!alerts.length)return null;
  return <div role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong>{alerts.length} SEO update{alerts.length===1?"":"s"} to review.</strong> <Link className="underline" href={`/social?entity=${encodeURIComponent(alerts[0].entityId)}&platform=seo`}>Open report and IT tasks</Link></div>;
}
