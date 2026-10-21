"use client";
import {useState} from "react";
import {toast} from "sonner";
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {listManualPackages} from "@/lib/manual-packages";
import type {Lead} from "@/lib/types";

const empty={firstName:"",lastName:"",businessName:"",email:"",phone:""};
export function ManualLeadPackages({open,onOpenChange,leads,onSaved}:{open:boolean;onOpenChange:(open:boolean)=>void;leads:Lead[];onSaved:()=>Promise<void>}){
  const [mode,setMode]=useState("single"),[target,setTarget]=useState("new"),[name,setName]=useState("");
  const [packageId,setPackageId]=useState<string|null>(null),[contact,setContact]=useState(empty),[bulk,setBulk]=useState("");
  const [saving,setSaving]=useState(false),[error,setError]=useState("");
  const packages=listManualPackages(leads);
  function close(next:boolean){if(saving)return;onOpenChange(next);if(!next){setMode("single");setTarget("new");setName("");setPackageId(null);setContact(empty);setBulk("");setError("");}}
  async function save(e:React.FormEvent){
    e.preventDefault();setError("");
    const existing=packages.find(p=>p.id===target),id=existing?.id||packageId||crypto.randomUUID();
    const packageName=existing?.name||name.trim();if(!packageName){setError("Give this new manual package a name");return;}
    const rows=mode==="single"?[contact]:bulk.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(value=>value.includes("@")?{email:value}:{phone:value});
    if(!rows.length||rows.length>100){setError("Add 1–100 contacts. Put one email or phone on each line.");return;}
    setPackageId(id);setSaving(true);
    try{
      const response=await fetch("/api/leads/manual-packages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,name:packageName,rows})});
      const json=await response.json();if(!response.ok)throw new Error(json.error||"Contacts could not save");
      const skipped=(json.blocked||0)+(json.conflicts||0);
      if(!json.total){setError("No contacts were added. These contacts are suppressed, converted, or match conflicting records. Nothing was queued.");return;}
      toast.success(`${packageName}: ${json.total} contacts · ${json.created} new · ${json.existing} existing added${skipped?` · ${skipped} blocked/conflicting rows skipped`:""}. No campaign launched.`);
      onOpenChange(false);setMode("single");setTarget("new");setName("");setPackageId(null);setContact(empty);setBulk("");await onSaved();
    }catch(e){setError(e instanceof Error?e.message:"Contacts could not save");}
    finally{setSaving(false);}
  }
  return <Dialog open={open} onOpenChange={close}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" showCloseButton><DialogHeader><DialogTitle>Add manual contacts</DialogTitle><DialogDescription>Add one contact or several to a named package. Only that package is included when you select it for a campaign. Existing contacts keep their history; this does not send anything.</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={save}><fieldset disabled={saving} className="space-y-4">
      <div className="grid gap-2"><Label htmlFor="manual-package">Manual package</Label><select id="manual-package" className="rounded-md border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2 text-sm" value={target} onChange={e=>{setTarget(e.target.value);setPackageId(null);}}><option value="new">Create a new package</option>{packages.map(p=><option key={p.id} value={p.id}>{p.name} ({p.count}) · {p.id.slice(0,8)}</option>)}</select></div>
      {target==="new"?<div className="space-y-2"><Label htmlFor="manual-package-name">New package name</Label><Input id="manual-package-name" maxLength={80} required value={name} onChange={e=>setName(e.target.value)} placeholder="HELOC review — October group"/><p className="text-xs text-[color:var(--ink-muted)]">A new package stays separate even if another package has the same name.</p></div>:<p className="text-sm text-[color:var(--ink-muted)]">Adding contacts to this existing package will increase its audience for future launches. Previously queued campaigns are unchanged.</p>}
      <div className="flex gap-2"><Button type="button" variant={mode==="single"?"default":"outline"} size="sm" onClick={()=>setMode("single")}>One contact</Button><Button type="button" variant={mode==="multiple"?"default":"outline"} size="sm" onClick={()=>setMode("multiple")}>Multiple contacts</Button></div>
      {mode==="single"?<div className="grid gap-3 sm:grid-cols-2">{([{key:"firstName",label:"First name"},{key:"lastName",label:"Last name"},{key:"businessName",label:"Business name"},{key:"email",label:"Email"},{key:"phone",label:"Phone"}] as const).map(f=><div key={f.key} className="space-y-1"><Label htmlFor={`manual-${f.key}`}>{f.label}</Label><Input id={`manual-${f.key}`} type={f.key==="email"?"email":f.key==="phone"?"tel":"text"} value={contact[f.key]} onChange={e=>setContact(v=>({...v,[f.key]:e.target.value}))}/></div>)}<p className="text-xs text-[color:var(--ink-muted)] sm:col-span-2">Email or phone is required.</p></div>:<div className="space-y-2"><Label htmlFor="manual-multiple">Emails or phone numbers — one per line</Label><Textarea id="manual-multiple" rows={7} required value={bulk} onChange={e=>setBulk(e.target.value)} placeholder={"person@company.com\nsecond@company.com\n+15165550100"}/><p className="text-xs text-[color:var(--ink-muted)]">Up to 100 contacts per save. Repeated contacts are included once. Opt-outs stay blocked; adding a phone does not grant text-marketing consent.</p></div>}
    </fieldset>{error?<p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>:null}<DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={()=>close(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving?"Saving…":"Save to package — no sending"}</Button></DialogFooter></form>
  </DialogContent></Dialog>;
}
