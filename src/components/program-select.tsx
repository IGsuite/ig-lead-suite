"use client";
import type { Brand } from "@/lib/types";
export function ProgramSelect({brand,value,onChange,label="Funding programs",disabled=false}:{brand:Pick<Brand,"programs">|null|undefined;value:string[];onChange:(value:string[])=>void;label?:string;disabled?:boolean}) {
  return <fieldset disabled={disabled} className="min-w-0 space-y-2 text-sm"><legend className="font-medium">{label}</legend>
    <details className="rounded-md border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-2">
      <summary className="cursor-pointer">{value.length ? value.join(" · ") : "Choose programs (optional)"}</summary>
      <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{(brand?.programs||[]).map(program=><label key={program} className="flex items-center gap-2"><input type="checkbox" checked={value.includes(program)} onChange={e=>onChange(e.target.checked?[...value,program]:value.filter(p=>p!==program))} />{program}</label>)}</div>
      {!brand?.programs.length ? <p className="text-xs">Choose a company with funding programs.</p>:null}
    </details>
    <p className="text-xs text-[color:var(--ink-muted)]">Select one or more. Unchecked means general / unassigned.</p>
  </fieldset>;
}
