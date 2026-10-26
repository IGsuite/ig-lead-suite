"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { setupStatuses, type SetupStatus } from "@/lib/company-setup";
import { toast } from "sonner";
type Company={id:string;name:string;websiteUrl:string;socialLinks:Record<string,string>};
type CatalogItem={key:string;title:string;category:string;url:string;steps:string[]};
type Item={id?:string;entityId:string;key:string;status:SetupStatus;accountName:string;username:string;loginUrl:string;profileUrl:string;vaultUrl:string;accountReference:string;assignee:string;notes:string;revision:number;updatedBy?:string;updatedAt?:string;hasPassword?:boolean;credentialRevision?:number};
type Data={companies:Company[];items:Item[];history:{id:string;message:string;createdAt:string}[];catalog:CatalogItem[];isAdmin:boolean;vaultConfigured:boolean};
const field="w-full rounded-md border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2 text-sm";
const panel="rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-5";
function Label({label,children}:{label:string;children:React.ReactNode}){return <label className="grid gap-1 text-sm">{label}{children}</label>;}
function defaultItem(company:Company,c:CatalogItem):Item{return {entityId:company.id,key:c.key,status:"not_started",accountName:company.name,username:"",loginUrl:c.key==="website"?"":c.url,profileUrl:c.key==="website"?company.websiteUrl:company.socialLinks?.[c.key]||"",vaultUrl:"",accountReference:"",assignee:"",notes:"",revision:0};}
export function CompanySetupWorkspace(){
  const [entity,setEntity]=useState(""),[data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[status,setStatus]=useState("all");
  const load=useCallback(async()=>{
    try{const r=await fetch(`/api/company-setup${entity?`?entityId=${encodeURIComponent(entity)}`:""}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"Could not load company setup");setData(d);setError("");}
    catch(e){setError(e instanceof Error?e.message:"Could not load company setup");}
  },[entity]);
  useEffect(()=>{let cancelled=false;const initial=window.location.search?new URLSearchParams(window.location.search).get("entity"):null;if(initial)queueMicrotask(()=>{if(!cancelled)setEntity(initial);});return ()=>{cancelled=true;};},[]);
  // load awaits the network before updating state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load();},[load]);
  const company=data?.companies.find(c=>c.id===entity);
  const companyItems=data?.items.filter(i=>i.entityId===entity)||[];
  async function save(item:Item){
    const {id:_,revision,updatedAt:__,updatedBy:___,hasPassword:____,credentialRevision:_____,...payload}=item;void _;void __;void ___;void ____;void _____;
    const r=await fetch("/api/company-setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:payload,revision})});const result=await r.json();if(!r.ok)throw Error(result.error||"Could not save setup");
    toast.success("Setup details saved; no account was connected or campaign launched");await load();window.dispatchEvent(new Event("alerts-updated"));
  }
  return <div className="space-y-5"><PageHeader title="Company setup" description="One checklist per company. Prepare accounts and access together, then have the owner verify each connection."/>
    {error?<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error} <button className="underline" onClick={()=>void load()}>Refresh</button></p>:null}
    {data?<><div className="flex flex-wrap gap-4"><Label label="Company"><select aria-label="Setup company" className={field} value={entity} onChange={e=>{setEntity(e.target.value);setStatus("all");history.replaceState(null,"",e.target.value?`/company-setup?entity=${encodeURIComponent(e.target.value)}`:"/company-setup");}}><option value="">All assigned companies</option>{data.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Label>{company?<Label label="Show tasks"><select className={field} value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All items</option>{Object.entries(setupStatuses).map(([key,name])=><option value={key} key={key}>{name}</option>)}</select></Label>:null}</div>
    <p className="text-sm text-[color:var(--ink-muted)]">Save account names, login usernames, links and account references. Use the protected password field inside each saved item; only administrators can reveal stored passwords. Keep passwords, recovery codes and API keys out of notes. Saving details does not authorize a paid plan, connect an account, or launch marketing.</p>
    {!company?<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.companies.map(c=>{const items=data.items.filter(i=>i.entityId===c.id),completed=items.filter(i=>i.status==="tested"||i.status==="not_applicable").length,needs=items.filter(i=>i.status==="needs_owner").length;return <article className={panel} key={c.id}><h2 className="text-lg font-medium">{c.name}</h2><p className="mt-2 text-sm">{completed} of {data.catalog.length} checked by owner · {needs} need owner help</p><progress className="my-3 w-full" aria-label={`${c.name} setup progress`} max={data.catalog.length} value={completed}/><Button variant="outline" onClick={()=>{setEntity(c.id);history.replaceState(null,"",`/company-setup?entity=${encodeURIComponent(c.id)}`);}}>Open checklist</Button></article>;})}</div>:<>
      {data.catalog.filter(c=>status==="all"||(companyItems.find(i=>i.key===c.key)?.status||"not_started")===status).map(c=><SetupItemEditor key={`${company.id}:${c.key}:${companyItems.find(i=>i.key===c.key)?.revision||0}`} catalog={c} item={companyItems.find(i=>i.key===c.key)||defaultItem(company,c)} isAdmin={data.isAdmin} onSave={save} vaultConfigured={data.vaultConfigured} onRefresh={load}/>)}
      <details className={panel}><summary className="cursor-pointer font-medium">Recent setup activity</summary><ul className="mt-3 space-y-2 text-sm">{data.history.map(h=><li key={h.id}>{new Date(h.createdAt).toLocaleString()} — {h.message}</li>)}{!data.history.length?<li>No saved changes yet.</li>:null}</ul></details>
    </>}
    <div className="flex gap-4 text-sm underline"><Link href="/alerts">Alerts &amp; Tasks</Link>{data.isAdmin?<Link href="/users">Invite a setup assistant</Link>:null}</div></>:<p>Loading company checklists…</p>}
  </div>;
}
function SetupItemEditor({catalog,item,isAdmin,onSave,vaultConfigured,onRefresh}:{catalog:CatalogItem;item:Item;isAdmin:boolean;onSave:(item:Item)=>Promise<void>;vaultConfigured:boolean;onRefresh:()=>Promise<void>}){
  const [draft,setDraft]=useState(()=>!isAdmin&&item.status==="tested"?{...item,status:"ready_for_review" as const}:item),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const change=(key:keyof Item,value:string)=>setDraft(s=>({...s,[key]:value}));
  return <details id={catalog.key} className={panel}><summary className="cursor-pointer"><strong>{catalog.title}</strong><span className="ml-3 text-sm text-[color:var(--ink-muted)]">{setupStatuses[item.status]}{item.assignee?` · ${item.assignee}`:""}</span></summary>
    <p className="mt-2 text-xs text-[color:var(--ink-muted)]">{catalog.category}</p><ol className="my-3 list-decimal space-y-1 pl-5 text-sm">{catalog.steps.map(step=><li key={step}>{step}</li>)}</ol>{catalog.url?<a className="text-sm underline" href={catalog.url} target="_blank" rel="noreferrer">Open {catalog.title}</a>:null}
    <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{await onSave(draft);}catch(e){setError(e instanceof Error?e.message:"Save failed");}finally{setBusy(false);}}}>
      <Label label="Status"><select className={field} value={draft.status} onChange={e=>change("status",e.target.value)}>{Object.entries(setupStatuses).filter(([key])=>isAdmin||!["tested","not_applicable"].includes(key)||key===draft.status).map(([key,name])=><option key={key} value={key} disabled={!isAdmin&&["tested","not_applicable"].includes(key)}>{name}</option>)}</select></Label>
      <Label label="Assigned person"><input className={field} value={draft.assignee} maxLength={254} onChange={e=>change("assignee",e.target.value)}/></Label>
      {([['accountName','Account / business name'],['username','Login email or username'],['loginUrl','Account login link'],['profileUrl','Public profile / website link'],['accountReference','Account / property / project ID'],['vaultUrl','Password-manager entry link']] as const).map(([key,label])=><Label label={label} key={key}><input className={field} type={key.endsWith("Url")?"url":"text"} value={draft[key]} maxLength={key.endsWith("Url")?1000:key==="accountReference"?200:key==="accountName"?150:254} autoComplete="off" onChange={e=>change(key,e.target.value)}/></Label>)}
      <Label label="What was completed / what help is needed"><textarea className={field} value={draft.notes} maxLength={3000} rows={3} onChange={e=>change("notes",e.target.value)} placeholder="Use this for setup notes, not passwords or codes."/></Label>
      <div className="self-end"><Button disabled={busy}>{busy?"Saving…":"Save setup item"}</Button></div>
      {error?<p role="alert" className="text-sm text-red-700 md:col-span-2">{error}</p>:null}
    </form><AccountPasswordPanel item={item} isAdmin={isAdmin} configured={vaultConfigured} onRefresh={onRefresh}/>{item.updatedAt?<p className="mt-3 text-xs text-[color:var(--ink-muted)]">Last saved by {item.updatedBy} · {new Date(item.updatedAt).toLocaleString()}</p>:null}
  </details>;
}

function AccountPasswordPanel({item,isAdmin,configured,onRefresh}:{item:Item;isAdmin:boolean;configured:boolean;onRefresh:()=>Promise<void>}){
  const [password,setPassword]=useState(""),[revealed,setRevealed]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{if(!revealed)return;const timer=setTimeout(()=>setRevealed(""),30000);const hide=()=>{if(document.hidden)setRevealed("");};document.addEventListener("visibilitychange",hide);return ()=>{clearTimeout(timer);document.removeEventListener("visibilitychange",hide);};},[revealed]);
  async function action(kind:"save"|"reveal"){
    setBusy(true);setError("");try{
      const r=await fetch("/api/company-setup/credentials",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:kind,entityId:item.entityId,key:item.key,...(kind==="save"?{password,revision:item.credentialRevision||0}:{})})});
      const data=await r.json();if(!r.ok)throw Error(data.error||"Password request failed");
      if(kind==="reveal")setRevealed(data.password);else {setPassword("");setRevealed("");toast.success("Account password saved securely");await onRefresh();}
      window.dispatchEvent(new Event("alerts-updated"));
    }catch(e){setError(e instanceof Error?e.message:"Password request failed");}finally{setBusy(false);}
  }
  return <section className="mt-4 rounded-lg border border-[color:var(--ink-border)] p-3"><h3 className="text-sm font-medium">Protected account password</h3><p className="mt-1 text-xs">{item.hasPassword?"A password is saved. Entering a new value replaces it.":"No password saved yet."} Setup assistants can save or replace it; only administrators can reveal it.</p>
    {!item.id?<p className="mt-2 text-xs">Save the account details above first.</p>:!configured?<p className="mt-2 text-xs">The administrator needs to finish activating protected password storage.</p>:<><form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();void action("save");}}><Label label="New or replacement password"><input className={field} type="password" autoComplete="new-password" maxLength={4096} value={password} onChange={e=>setPassword(e.target.value)} required/></Label><Button size="sm" disabled={busy||!password}>Save encrypted password</Button></form>
      {isAdmin&&item.hasPassword?<div className="mt-3">{revealed?<><Label label="Stored password — hides after 30 seconds"><input className={field} type="text" readOnly value={revealed} autoComplete="off"/></Label><Button className="mt-2" variant="outline" size="sm" onClick={()=>setRevealed("")}>Hide password</Button></>:<Button variant="outline" size="sm" disabled={busy} onClick={()=>void action("reveal")}>Reveal stored password</Button>}</div>:null}</>}
    {error?<p role="alert" className="mt-2 text-sm text-red-700">{error}</p>:null}
  </section>;
}
