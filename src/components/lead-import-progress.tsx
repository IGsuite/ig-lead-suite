"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
type Job = {id:string;filename:string;status:string;offset:number;sizeBytes:number;csvBytes:number|null;rowCount:number;importedCount:number;duplicateCount:number;skippedCount:number;suppressedCount:number;error:string|null};
export function LeadImportProgress({revision,onChange}:{revision:number;onChange:()=>Promise<void>}) {
  const [jobs,setJobs] = useState<Job[]>([]),[busy,setBusy] = useState("");
  const refresh = useCallback(async()=>{
    const response = await fetch("/api/leads/imports",{cache:"no-store"});
    if(response.ok)setJobs((await response.json()).jobs||[]);
  },[]);
  useEffect(()=>{void refresh();},[refresh,revision]);
  const running = jobs.some(j=>["queued","processing"].includes(j.status));
  useEffect(()=>{
    if(!running)return;
    const interval=setInterval(()=>{void refresh();void onChange();},5000);
    return()=>clearInterval(interval);
  },[running,refresh,onChange]);
  async function action(id:string,action:string) {
    setBusy(id);
    try {
      const response=await fetch("/api/leads/imports",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action})});
      if(!response.ok)throw new Error("Import could not be updated");
      await refresh();await onChange();
    }catch(e){toast.error(e instanceof Error?e.message:"Import could not be updated");}
    finally{setBusy("");}
  }
  if(!jobs.length)return null;
  return <section className="mb-6 space-y-3 rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4"><h2 className="font-medium">Background imports</h2><p className="text-xs text-[color:var(--ink-muted)]">After the file upload finishes, you can leave this page. Saved batches survive an interruption. Importing never launches a campaign.</p>{jobs.slice(0,6).map(job=><div key={job.id} className="rounded-md border border-[color:var(--ink-border)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{job.filename}</strong><span className="text-xs">{job.status} · {Math.min(100,Math.floor(job.offset/(job.csvBytes||job.sizeBytes)*100))}%</span></div><progress aria-label={`${job.filename} import progress`} className="mt-2 w-full" max={job.csvBytes||job.sizeBytes} value={job.offset}/><p className="mt-1 text-xs">{job.rowCount.toLocaleString()} rows processed · {job.importedCount.toLocaleString()} new · {job.duplicateCount.toLocaleString()} existing/duplicate · {job.skippedCount.toLocaleString()} empty · {job.suppressedCount.toLocaleString()} suppressed</p>{job.error?<p role="alert" className="mt-2 text-sm text-red-700">{job.error}</p>:null}{job.status!=="completed"?<div className="mt-2 flex gap-2"><Button size="sm" variant="outline" disabled={busy===job.id} onClick={()=>void action(job.id,"resume")}>Resume</Button>{job.status!=="cancelled"?<Button size="sm" variant="outline" disabled={busy===job.id} onClick={()=>void action(job.id,"cancel")}>Stop import</Button>:null}</div>:null}</div>)}</section>;
}
