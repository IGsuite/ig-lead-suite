import {test} from "node:test";
import assert from "node:assert/strict";
import {filterMarketingPlan,marketingPlanItems} from "../src/lib/calendar-overview";
import type {CalendarEntry} from "../src/lib/marketing-calendar";
import type {SocialCampaign} from "../src/lib/types";

const brands=[{id:"abstract",shortName:"Abstract"},{id:"ahava",shortName:"Ahava"}];
const entry={id:"day1",brandId:"abstract",product:"HELOC",date:"2026-10-21",startTime:"09:00",endTime:"20:00",timezone:"America/New_York",channel:"email",status:"draft",snapshot:{name:"HELOC day",programs:["HELOC"],volume:250,sourceFilter:"__audience_not_selected__",subject:"HELOC options"}} as CalendarEntry;
const social={id:"social1",entityId:"ahava",platform:"meta",name:"Fall social plan",status:"draft",objective:"Business growth",scheduleStart:"2026-09-28",scheduleEnd:"2026-10-04",creativeTemplateId:"tpl1"} as SocialCampaign;
test("calendar overview combines email, text and social date ranges without inventing publication or unscheduled dates",()=>{
  const items=marketingPlanItems(brands,[entry,{...entry,id:"sms1",channel:"sms",brandId:"ahava"}],[social,{...social,id:"no-date",scheduleStart:null},{...social,id:"backwards",scheduleEnd:"2026-09-01"},{...social,id:"invalid",scheduleStart:"2026-02-30"}],[{id:"tpl1",programs:["Term Loans"]}]);
  assert.equal(items.length,3);assert.equal(items.filter(i=>i.planningOnly).length,1);
  assert.equal(items[0].startDate,"2026-09-28");assert.equal(items[0].endDate,"2026-10-04");assert.deepEqual(items[0].programs,["Term Loans"]);
  assert.equal(items.find(i=>i.id==="day1")?.status,"draft");assert.match(items.find(i=>i.id==="day1")!.detail,/not selected/);
  assert.match(items.find(i=>i.id==="day1")!.href,/month=2026-10/);
  assert.equal(filterMarketingPlan(items,{month:"2026-10",brandId:"all",kind:"all",program:"all"}).length,3);
  assert.equal(filterMarketingPlan(items,{month:"2026-11",brandId:"all",kind:"all",program:"all"}).length,0);
  assert.equal(filterMarketingPlan(items,{month:"2026-10",brandId:"ahava",kind:"social",program:"Term Loans"}).length,1);
  assert.equal(filterMarketingPlan(items,{month:"2026-10",brandId:"abstract",kind:"email",program:"HELOC"}).length,1);
  assert.equal(filterMarketingPlan(items,{month:"2026-10",brandId:"abstract",kind:"sms",program:"all"}).length,0);
});
test("overview excludes companies absent from the accessible company catalog and leaves source records unchanged",()=>{
 const before=JSON.stringify({entry,social});
 const items=marketingPlanItems([brands[0]],[entry,{...entry,id:"private",brandId:"other"}],[social],[]);
 assert.equal(items.length,1);assert.equal(items[0].company,"Abstract");assert.equal(JSON.stringify({entry,social}),before);
});
