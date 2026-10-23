"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorPanel, LoadingPanel } from "@/components/state-panels";
import { subscriptionTotals, type SubscriptionInput, type SubscriptionRecord } from "@/lib/subscriptions";

type Company={id:string;name:string};
const empty:SubscriptionInput={companyIds:[],service:"",purpose:"",loginUrl:"",username:"",vaultUrl:"",plan:"",amountCents:null,currency:"USD",billingCycle:"monthly",renewalDate:"",status:"needs_review",notes:""};
const labelClass="grid gap-1 text-sm",selectClass="rounded-lg border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2";
const money=(cents:number,currency:string)=>new Intl.NumberFormat("en-US",{style:"currency",currency}).format(cents/100);

function SubscriptionsInner(){
  const params=useSearchParams(),initial=params.get("company")||"all";
  const [companies,setCompanies]=useState<Company[]>([]),[rows,setRows]=useState<SubscriptionRecord[]>([]);
  const [filter,setFilter]=useState(initial),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [draft,setDraft]=useState<SubscriptionInput|null>(null),[saving,setSaving]=useState(false),[formError,setFormError]=useState("");
  const load=useCallback(async()=>{try{const response=await fetch("/api/subscriptions",{cache:"no-store"}),data=await response.json();if(!response.ok)throw Error(data.error||"Unable to load subscriptions");setRows(data.subscriptions);setCompanies(data.companies);setError("");}catch(e){setError(e instanceof Error?e.message:"Unable to load subscriptions");}finally{setLoading(false);}},[]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/subscriptions",{cache:"no-store",signal:controller.signal}).then(async response=>{
      const data=await response.json();if(!response.ok)throw Error(data.error||"Unable to load subscriptions");
      setRows(data.subscriptions);setCompanies(data.companies);setError("");setLoading(false);
    }).catch(e=>{if(!controller.signal.aborted){setError(e instanceof Error?e.message:"Unable to load subscriptions");setLoading(false);}});
    return ()=>controller.abort();
  },[]);
  const visible=useMemo(()=>rows.filter(row=>filter==="all"||row.companyIds.includes(filter)),[rows,filter]);
  const totals=useMemo(()=>subscriptionTotals(visible),[visible]);
  function edit(row:SubscriptionRecord){const {id,companyIds,service,purpose,loginUrl,username,vaultUrl,plan,amountCents,currency,billingCycle,renewalDate,status,notes}=row;setDraft({id,companyIds,service,purpose,loginUrl,username,vaultUrl,plan,amountCents,currency,billingCycle,renewalDate,status,notes});setFormError("");}
  async function save(event:React.FormEvent){event.preventDefault();if(!draft||saving)return;setSaving(true);setFormError("");try{const response=await fetch("/api/subscriptions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(draft)}),data=await response.json();if(!response.ok)throw Error(data.error||"Unable to save subscription");await load();setDraft(null);}catch(e){setFormError(e instanceof Error?e.message:"Unable to save subscription");}finally{setSaving(false);}}
  if(loading)return <LoadingPanel label="Loading subscriptions…"/>;
  if(error)return <ErrorPanel message={error} onRetry={load}/>;
  return <div className="space-y-6">
    <PageHeader title="Subscriptions & accounts" description="Keep each company’s services, sign-in links, billing and password-manager references together. Administrators only." actions={<Link href="/brands">All entities →</Link>}/>
    <div className="flex flex-wrap items-end gap-4">
      <label className={labelClass}>Company<select className={selectClass} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All companies</option>{companies.map(company=><option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      <Button onClick={()=>{setDraft({...empty,companyIds:filter==="all"?[]:[filter]});setFormError("");}}>Add subscription</Button>
    </div>
    <div className="rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4 text-sm">
      <p className="font-medium">Recorded recurring cost: {Object.entries(totals.monthly).map(([currency,amount])=>`${money(amount,currency)}/month`).join(" + ")||"No priced recurring subscriptions"}</p>
      <p className="mt-1 text-[color:var(--ink-muted)]">Annual bills are divided by 12. Shared subscriptions count once in the all-company view. Amounts are entered manually; taxes, usage charges and unknown prices are not included. {totals.unpriced} active or trial entries have unknown or usage-based charges.</p>
    </div>
    {draft&&<form onSubmit={save} className="space-y-4 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
      <h2 className="text-xl font-medium">{draft.id?"Edit subscription":"New subscription"}</h2>
      <fieldset><legend className="mb-2 text-sm font-medium">Companies using this account</legend><div className="flex flex-wrap gap-4">{companies.map(company=><label key={company.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.companyIds.includes(company.id)} onChange={e=>setDraft({...draft,companyIds:e.target.checked?[...draft.companyIds,company.id]:draft.companyIds.filter(id=>id!==company.id)})}/>{company.name}</label>)}</div><p className="mt-1 text-xs text-[color:var(--ink-muted)]">Select several companies for a shared account. Enter its full bill once.</p></fieldset>
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>Service<Input required maxLength={100} value={draft.service} onChange={e=>setDraft({...draft,service:e.target.value})}/></label>
        <label className={labelClass}>Used for<Input required maxLength={500} value={draft.purpose} onChange={e=>setDraft({...draft,purpose:e.target.value})}/></label>
        <label className={labelClass}>Login link<Input required type="url" placeholder="https://…" value={draft.loginUrl} onChange={e=>setDraft({...draft,loginUrl:e.target.value})}/></label>
        <label className={labelClass}>Username or login email<Input autoComplete="off" maxLength={254} value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value})}/></label>
        <label className={labelClass}>Password-manager entry link<Input type="url" placeholder="Secure link to the saved login" value={draft.vaultUrl} onChange={e=>setDraft({...draft,vaultUrl:e.target.value})}/></label>
        <label className={labelClass}>Plan<Input maxLength={100} value={draft.plan} onChange={e=>setDraft({...draft,plan:e.target.value})}/></label>
        <label className={labelClass}>Amount per billing period (leave blank if unknown)<Input type="number" min="0" max="1000000" step="0.01" value={draft.amountCents===null?"":draft.amountCents/100} onChange={e=>setDraft({...draft,amountCents:e.target.value===""?null:Math.round(Number(e.target.value)*100)})}/></label>
        <label className={labelClass}>Currency<select className={selectClass} value={draft.currency} onChange={e=>setDraft({...draft,currency:e.target.value as SubscriptionInput["currency"]})}>{["USD","EUR","GBP","CAD"].map(c=><option key={c}>{c}</option>)}</select></label>
        <label className={labelClass}>Billing period<select className={selectClass} value={draft.billingCycle} onChange={e=>setDraft({...draft,billingCycle:e.target.value as SubscriptionInput["billingCycle"]})}>{["monthly","annual","usage","one_time","free"].map(c=><option key={c} value={c}>{c.replaceAll("_"," ")}</option>)}</select></label>
        <label className={labelClass}>Next renewal date<Input type="date" value={draft.renewalDate} onChange={e=>setDraft({...draft,renewalDate:e.target.value})}/></label>
        <label className={labelClass}>Status<select className={selectClass} value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as SubscriptionInput["status"]})}>{["active","trial","paused","cancelled","needs_review"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></label>
        <label className={labelClass}>Notes<Input maxLength={2000} placeholder="No passwords, payment details or API keys" value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
      </div>
      <p className="text-sm text-[color:var(--ink-muted)]">Passwords and API keys belong in your password manager. This inventory stores the link to that entry, not its secret contents. Cancelling an entry here only changes your records; it does not cancel billing with the provider.</p>
      {formError&&<p role="alert" className="text-sm text-red-700">{formError}</p>}
      <div className="flex gap-3"><Button type="submit" disabled={saving}>{saving?"Saving…":"Save subscription"}</Button><Button type="button" variant="outline" onClick={()=>setDraft(null)} disabled={saving}>Cancel</Button></div>
    </form>}
    {!visible.length?<p className="rounded-2xl border border-[color:var(--ink-border)] p-5">No subscriptions recorded for this selection. Add a service to keep its details here.</p>:<div className="grid gap-4 md:grid-cols-2">{visible.map(row=><article key={row.id} className="space-y-3 rounded-2xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-medium">{row.service}</h2><p className="text-sm text-[color:var(--ink-muted)]">{row.purpose}</p></div><span className="text-xs">{row.status.replaceAll("_"," ")}</span></div>
      <p className="text-sm">{row.companyIds.map(id=>companies.find(c=>c.id===id)?.name||id).join(" · ")}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-[color:var(--ink-muted)]">Login</dt><dd className="break-all">{row.username||"Not recorded"}</dd></div><div><dt className="text-[color:var(--ink-muted)]">Plan</dt><dd>{row.plan||"Not recorded"}</dd></div><div><dt className="text-[color:var(--ink-muted)]">Billing</dt><dd>{row.billingCycle==="free"?"Free":row.amountCents===null?"Amount not confirmed":money(row.amountCents,row.currency)} · {row.billingCycle.replaceAll("_"," ")}</dd></div><div><dt className="text-[color:var(--ink-muted)]">Next renewal</dt><dd>{row.renewalDate||"Not recorded"}</dd></div></dl>
      {row.notes&&<p className="whitespace-pre-wrap text-sm">{row.notes}</p>}
      <div className="flex flex-wrap items-center gap-4 text-sm"><a href={row.loginUrl} target="_blank" rel="noopener noreferrer" className="underline">Open service</a>{row.vaultUrl?<a href={row.vaultUrl} target="_blank" rel="noopener noreferrer" className="underline">Open saved login</a>:<span className="text-[color:var(--ink-muted)]">Password-manager link not added</span>}<Button variant="outline" onClick={()=>edit(row)}>Edit</Button></div>
    </article>)}</div>}
  </div>;
}
export default function SubscriptionsPage(){return <Suspense fallback={<LoadingPanel label="Loading subscriptions…"/>}><SubscriptionsInner/></Suspense>;}
