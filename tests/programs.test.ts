import {test} from "node:test";
import assert from "node:assert/strict";
import {validatePrograms,programTemplateMatches,programDraft} from "../src/lib/programs";
import {selectLeadsForSend} from "../src/lib/rotation-select";
import {calendarSnapshot} from "../src/lib/marketing-calendar";
import {matchesAudienceFilter,serializeAudienceFilter,audienceContactKey} from "../src/lib/audience-filters";
import type {Lead,Campaign,MessageTemplate,Brand} from "../src/lib/types";
import {mockDraftCopy} from "../src/lib/draft-copy-ai";

test("new entities get service-specific starter and fallback copy without inheriting financing outreach",()=>{
 for(const channel of ["email","sms"] as const){
  const dental={id:"imagination-orthodontics"} as Brand;
  const software={id:"bankable-credit"} as Brand;
  for(const programs of [[],["Invisalign"]]){
   for(const draft of [programDraft(programs,channel,dental),mockDraftCopy({brand:dental,programs,channel})]){
    assert.match(draft.message,/consultation/);assert.doesNotMatch(draft.message,/working capital|third-party providers|foreclosure|underwriting/);
    assert.match(draft.message,channel==="sms"?/STOP to opt out/:/Unsubscribe/);
   }
  }
  for(const programs of [[],["UCC & Judgment Monitoring"]]){
   for(const draft of [programDraft(programs,channel,software),mockDraftCopy({brand:software,programs,channel})]){
    assert.match(draft.message,/preparing.*launch/);assert.match(draft.message,/waitlist/);assert.doesNotMatch(draft.message,/working capital|third-party providers|foreclosure/);
   }
  }
  const abstract=programDraft(["HELOC"],channel,{id:"abstract"});assert.match(abstract.message,/foreclosure/);assert.match(abstract.message,/third-party providers/);
 }
});
test("program choices belong to the company, deduplicate, and filter templates by channel and selected programs",()=>{
 const brand={programs:["HELOC","SBA 7(a)","Term Loans"]};
 assert.deepEqual(validatePrograms(brand,["HELOC","SBA 7(a)","HELOC"]),["HELOC","SBA 7(a)"]);
 assert.throws(()=>validatePrograms(brand,["Other company's product"]));assert.throws(()=>validatePrograms(null,["HELOC"]));assert.throws(()=>validatePrograms(brand,"HELOC"));
 const tpl={brandId:"abstract",channel:"email",programs:["HELOC"]} as MessageTemplate;
 assert.equal(programTemplateMatches(tpl,"abstract",["SBA 7(a)","HELOC"],"email"),true);
 assert.equal(programTemplateMatches({...tpl,programs:["HELOC","Term Loans"]},"abstract",["HELOC"],"email"),false);
 assert.equal(programTemplateMatches(tpl,"ahava",["HELOC"],"email"),false);
 assert.equal(programTemplateMatches(tpl,"abstract",["HELOC"],"sms"),false);
 assert.equal(programTemplateMatches(tpl,"abstract",[],"email"),false);
 assert.match(programDraft(["HELOC","SBA 7(a)"],"email").message,/foreclosure/);
});
test("multi-program calendar snapshots preserve selected products and multiple lead packages",()=>{
 const campaign={brandId:"abstract",programs:["HELOC","SBA 7(a)"],channel:"email",sourceFilter:"Package A,Package B",message:"original"} as Campaign;
 const input={brandId:"abstract",product:"HELOC + SBA 7(a)",campaignId:"test",startDate:"2026-11-02",endDate:"2026-11-02",weekdays:[1],startTime:"09:00",endTime:"20:00",timezone:"America/New_York",volume:250,throttlePerHour:25};
 const template={brandId:"abstract",channel:"email",programs:["HELOC"],body:"HELOC copy"} as MessageTemplate;
 const snapshot=calendarSnapshot(campaign,template,input);assert.deepEqual(snapshot.programs,campaign.programs);assert.equal(snapshot.sourceFilter,"Package A,Package B");assert.equal(snapshot.status,"draft");
 assert.throws(()=>calendarSnapshot(campaign,{...template,programs:["Term Loans"]},input));
 assert.throws(()=>calendarSnapshot(campaign,template,{...input,product:"HELOC"}));
});
test("multiple packages select their union once per delivery address and honor duplicate opt-outs and history",()=>{
 const base={id:"fixture",source:"fixture",lastEntityId:null,convertedEntityId:null,createdAt:new Date().toISOString(),status:"available",offeredEntityIds:[],emailStatus:"valid",phoneStatus:"valid",optedOut:false,groupName:"Prospects",purchaseDate:"2026-10-21",costCents:0} as Lead;
 const leads=[{...base,id:"a",source:"Package A",email:"Owner@fixture.invalid"},{...base,id:"b",source:"Package B",email:" owner@fixture.invalid "},{...base,id:"c",source:"Package B",email:"second@fixture.invalid"},{...base,id:"d",source:"Other",email:"other@fixture.invalid"}];
 const sourceFilter=serializeAudienceFilter(["Package A","Package B"]);
 assert.equal(matchesAudienceFilter("Package B",sourceFilter),true);assert.equal(matchesAudienceFilter("Other",sourceFilter),false);
 const input={leads,sendEvents:[],entityId:"abstract",channel:"email" as const,volume:10,mode:"own" as const,messageFingerprint:"same",sourceFilter};
 const selected=selectLeadsForSend(input);assert.equal(selected.selected.length,2);assert.equal(selected.eligibleCount,2);
 assert.equal(selectLeadsForSend({...input,leads:leads.map(l=>l.id==="b"?{...l,optedOut:true}:l)}).selected.length,1);
 assert.equal(selectLeadsForSend({...input,sendEvents:[{leadId:"b",messageFingerprint:"same",sentAt:new Date().toISOString()} as never]}).selected.length,1);
 assert.equal(audienceContactKey({phone:"(516) 555-0100"},"sms"),audienceContactKey({phone:"+1 516-555-0100"},"sms"));
});
