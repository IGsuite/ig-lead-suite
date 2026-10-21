import {test} from "node:test";
import assert from "node:assert/strict";
import {planManualPackage} from "../src/lib/manual-package-plan";
import {leadSourceLabel,listManualPackages,manualPackageSource,matchesLeadSource} from "../src/lib/manual-packages";
import {selectLeadsForSend} from "../src/lib/rotation-select";
import type {Lead} from "../src/lib/types";
const packageId="41e187b7-b10a-4cf9-aa19-d487c55cb89b",secondId="7283086e-9e0c-493a-91dd-51cfb05110cf";
const base:Lead={id:"old",source:"Manual",groupName:"Manual",purchaseDate:"2026-10-21",costCents:0,offeredEntityIds:[],lastEntityId:null,convertedEntityId:null,status:"available",optedOut:false,emailStatus:"valid",phoneStatus:"unverified",email:"old@example.invalid",createdAt:"2026-10-21"};
test("a ten-contact manual package excludes all old manual contacts and remains separate from a same-named package",()=>{
 const original=[base],rows=Array.from({length:10},(_,i)=>({email:`new${i}@example.invalid`}));
 const first=planManualPackage(original,[],{id:packageId,name:"Review group",rows});
 assert.equal(first.result.total,10);assert.equal(first.result.created,10);assert.equal(first.leads.length,11);assert.equal(original[0].manualPackages,undefined);
 const second=planManualPackage(first.leads,[],{id:secondId,name:"Review group",rows:[{email:"second@example.invalid"}]});
 const chosen=selectLeadsForSend({leads:second.leads,sendEvents:[],entityId:"abstract",channel:"email",volume:100,mode:"own",messageFingerprint:"manual",sourceFilter:manualPackageSource(packageId)});
 assert.equal(chosen.selected.length,10);assert.ok(chosen.selected.every(l=>l.id!=="old"&&l.email!=="second@example.invalid"));
 assert.equal(listManualPackages(second.leads).length,2);assert.match(leadSourceLabel(manualPackageSource(packageId),second.leads),/Review group/);
 assert.equal(matchesLeadSource(base,manualPackageSource(packageId)),false);
});
test("existing contacts join explicit packages without duplicates, overwritten source/history, or new text consent; retries are idempotent",()=>{
 const source={...base,source:"Original provider",offeredEntityIds:["ahava"],status:"contacted" as const};
 const first=planManualPackage([source],[],{id:packageId,name:"First",rows:[{email:base.email!},{email:base.email!.toUpperCase()}]});
 assert.equal(first.leads.length,1);assert.equal(first.result.existing,1);assert.equal(first.result.total,1);assert.equal(first.leads[0].source,"Original provider");assert.deepEqual(first.leads[0].offeredEntityIds,["ahava"]);assert.equal(first.leads[0].smsConsents,undefined);
 const again=planManualPackage(first.leads,[],{id:packageId,name:"Ignored rename",rows:[{email:base.email!}]});
 assert.equal(again.changes.length,0);assert.equal(again.result.package.name,"First");
 const second=planManualPackage(first.leads,[],{id:secondId,name:"Second",rows:[{email:base.email!}]});
 assert.equal(second.leads.length,1);assert.equal(second.leads[0].manualPackages?.length,2);
});
test("validation fails before any write; suppressed, converted and conflicting identities cannot join a manual package",()=>{
 const original=[{...base,optedOut:true}];assert.throws(()=>planManualPackage(original,[],{id:packageId,name:"Group",rows:[{email:"bad"}]}));assert.equal(original[0].manualPackages,undefined);
 assert.equal(planManualPackage(original,[],{id:packageId,name:"Group",rows:[{email:base.email!}]}).result.blocked,1);
 assert.equal(planManualPackage([], [{contact:"+15165550100"}],{id:packageId,name:"Group",rows:[{phone:"516-555-0100"}]}).result.blocked,1);
 assert.equal(planManualPackage([base,{...base,id:"duplicate"}],[],{id:packageId,name:"Group",rows:[{email:base.email!}]}).result.conflicts,1);
});
