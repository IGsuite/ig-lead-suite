"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export function SeoAlertBanner(){
  const [alerts,setAlerts]=useState<{id:string;entityId:string;message:string}[]>([]);
  useEffect(()=>{
    let active=true;
    async function check(){try{const r=await fetch("/api/alerts",{cache:"no-store"});if(r.ok){const d=await r.json();if(active)setAlerts(d.items||[]);}}catch{/* The page remains usable if notification polling is unavailable. */}}
    void check();const timer=setInterval(()=>void check(),60000);window.addEventListener("alerts-updated",check);return ()=>{active=false;clearInterval(timer);window.removeEventListener("alerts-updated",check);};
  },[]);
  if(!alerts.length)return null;
  return <div role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"><strong>{alerts.length} update{alerts.length===1?"":"s"} to review.</strong> <Link className="underline" href="/alerts">Open Alerts &amp; Tasks</Link></div>;
}
