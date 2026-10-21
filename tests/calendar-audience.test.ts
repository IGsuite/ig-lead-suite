import {test} from "node:test";
import assert from "node:assert/strict";
import {selectLeadsForSend} from "../src/lib/rotation-select";
import {audienceContactKey} from "../src/lib/audience-filters";
import {contactOkForChannel} from "../src/lib/verify";
import {calendarOnly} from "../src/lib/calendar-audience-client";
import type {Lead} from "../src/lib/types";

const lead=(i:number):Lead=>({id:`pool-${i}`,email:`pool-${i}@fixture.invalid`,source:i%2?"CSV A":"CSV B",groupName:"General",purchaseDate:"2026-10-21",costCents:0,offeredEntityIds:[],lastEntityId:null,convertedEntityId:null,status:"available",optedOut:false,emailStatus:"valid",phoneStatus:"unverified",createdAt:"2026-10-21"});

test("four calendar dates draw 250 distinct identities from the shared pool and never fill exhausted days with repeats",()=>{
  const leads=Array.from({length:1000},(_,i)=>lead(i));
  // Overlapping CSV copies cannot pad the audience or bypass prior-date history.
  leads.push({...leads[0],id:"duplicate-row",source:"CSV C",email:leads[0].email!.toUpperCase()});
  const used=new Set<string>();
  const input={leads,sendEvents:[],entityId:"abstract",channel:"email" as const,volume:250,mode:"auto" as const,sourceFilter:"all",messageFingerprint:"heloc",preferVerified:true,excludedContactKeys:used};
  for(let day=0;day<4;day++){
    const pick=selectLeadsForSend({...input,poolCursor:day*250,now:new Date(`2026-10-${21+day}T14:00Z`)});
    assert.equal(pick.selected.length,250);
    for(const l of pick.selected){const key=audienceContactKey(l,"email");assert.ok(!used.has(key));used.add(key);}
  }
  assert.equal(used.size,1000);
  assert.equal(selectLeadsForSend(input).selected.length,0);
  assert.equal(selectLeadsForSend({...input,excludedContactKeys:new Set(),sourceFilter:"CSV A"}).selected.length,250);
});

test("verified-only uses the saved channel check and skips risky, invalid, unverified and stale malformed contacts",()=>{
  const good=lead(0);
  assert.equal(contactOkForChannel(good,"email",true),true);
  for(const emailStatus of ["unverified","risky","invalid"] as const)assert.equal(contactOkForChannel({...good,emailStatus},"email",true),false);
  assert.equal(contactOkForChannel({...good,email:"broken"},"email",true),false);
  assert.equal(contactOkForChannel({...good,email:"example@example.com"},"email",true),false);
  assert.equal(contactOkForChannel({...good,phone:"+12125550111",phoneStatus:"valid"},"sms",true),true);
  assert.equal(contactOkForChannel({...good,phone:"+12125550111",phoneStatus:"unverified"},"sms",true),false);
  assert.equal(contactOkForChannel(good,"sms",true),false);
  const leads=[good,{...lead(1),emailStatus:"unverified" as const},{...lead(2),emailStatus:"risky" as const},{...lead(3),optedOut:true},{...lead(4),status:"converted" as const}];
  assert.equal(selectLeadsForSend({leads,sendEvents:[],entityId:"abstract",channel:"email",volume:250,mode:"auto",sourceFilter:"all",messageFingerprint:"heloc",preferVerified:true}).selected.length,1);
});

test("automatic parent campaigns cannot direct-launch outside their calendar",()=>{
  assert.equal(calendarOnly({id:"camp-parent",mode:"auto"}),true);
  assert.equal(calendarOnly({id:"camp-parent",mode:"own"}),false);
  assert.equal(calendarOnly({id:"camp-calendar-run",mode:"auto"}),false);
  assert.equal(calendarOnly({id:"camp-auto-legacy",mode:"auto"}),false);
});
