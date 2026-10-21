"use client";
import { useEffect, useState, useCallback } from "react";
import type { Lead } from "@/lib/types";
export type LeadDirectory = { leads: Lead[]; total: number; filteredCount: number; nextCursor: string | null;
  stats: Record<string,number>; groups: string[]; packages: {id:string;name:string;count:number}[] };
export function useLeadDirectory(query: string, group: string, source: string, folder: string) {
  const key = JSON.stringify([query,group,source,folder]);
  const [position,setPosition] = useState<{key:string;cursors:(string|null)[]}>({key,cursors:[null]});
  const cursors = position.key === key ? position.cursors : [null];
  const cursor = cursors.at(-1);
  const [data,setData] = useState<LeadDirectory|null>(null), [error,setError] = useState("");
  const [revision,setRevision] = useState(0), [loading,setLoading] = useState(true);
  const refresh = useCallback(async () => {setRevision(v=>v+1);},[]);
  useEffect(()=>{
    const abort = new AbortController();
    const timer = setTimeout(async()=>{
      setLoading(true);setError("");
      try {
        const params = new URLSearchParams({q:query,group,source,folder});
        if(cursor)params.set("cursor",cursor);
        const response = await fetch(`/api/leads/list?${params}`,{signal:abort.signal,cache:"no-store"});
        const json = await response.json();
        if(!response.ok)throw new Error(json.error||"Could not load leads");
        if(!abort.signal.aborted)setData(json);
      } catch(e) {if(!abort.signal.aborted)setError(e instanceof Error?e.message:"Could not load leads");}
      finally{if(!abort.signal.aborted)setLoading(false);}
    },200);
    return()=>{clearTimeout(timer);abort.abort();};
  },[query,group,source,folder,cursor,revision]);
  return {data,error,loading,refresh,page:cursors.length,
    next:()=>{if(data?.nextCursor)setPosition({key,cursors:[...cursors,data.nextCursor]});},
    previous:()=>setPosition({key,cursors:cursors.slice(0,-1).length?cursors.slice(0,-1):[null]}),
  };
}
