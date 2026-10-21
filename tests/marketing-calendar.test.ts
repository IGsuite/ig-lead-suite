import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarInput,calendarDates,calendarDisposition,calendarSnapshot } from "../src/lib/marketing-calendar";
import type { Campaign, MessageTemplate } from "../src/lib/types";
const input = {brandId:"abstract",product:"HELOC",campaignId:"test",startDate:"2026-10-20",endDate:"2026-10-31",weekdays:[1,2,3,4,5],startTime:"09:00",endTime:"20:00",timezone:"America/New_York",volume:1,throttlePerHour:15};
test("calendar drafts expand actual weekdays and enforce a bounded valid local-date range",()=>{
  const parsed = calendarInput.parse(input), now = new Date("2026-10-20T14:00Z");
  assert.equal(calendarDates(parsed,now).length,9);
  assert.throws(()=>calendarDates({...parsed,startDate:"2026-10-19"},now));
  assert.throws(()=>calendarDates({...parsed,endDate:"2027-10-21"},now));
  assert.equal(calendarInput.safeParse({...input,startDate:"2026-02-30"}).success,false);
  assert.equal(calendarInput.safeParse({...input,startTime:"21:00"}).success,false);
  assert.equal(calendarInput.safeParse({...input,timezone:"invalid"}).success,false);
  assert.equal(calendarInput.safeParse({...input,volume:-1}).success,false);
});
test("only approved and enabled dates run; future, paused and expired entries never catch up; DST follows local time",()=>{
  const e = {...input,date:"2026-11-02",status:"approved"};
  assert.equal(calendarDisposition(e,true,new Date("2026-11-02T13:59Z")),"future");
  assert.equal(calendarDisposition(e,true,new Date("2026-11-02T14:00Z")),"due");
  assert.equal(calendarDisposition(e,false,new Date("2026-11-02T14:00Z")),"paused");
  assert.equal(calendarDisposition({...e,status:"draft"},true,new Date("2026-11-02T14:00Z")),"paused");
  assert.equal(calendarDisposition(e,true,new Date("2026-11-03T01:00Z")),"expired");
  assert.equal(calendarDisposition(e,true,new Date("2026-11-04T14:00Z")),"expired");
  assert.equal(calendarDisposition({...e,date:"2026-10-30"},true,new Date("2026-10-30T13:00Z")),"due");
});
test("dated snapshots isolate products and company/channel templates, reset counters, preserve artwork or replace old HTML",()=>{
  const c = {id:"test",brandId:"abstract",channel:"email",message:"old",subject:"old subject",htmlMessage:"<p>old</p>",imageUrl:"https://example.invalid/a.png",sentCount:5,status:"completed",sourceFilter:"Manual",groupFilter:"Manual"} as Campaign;
  const s = calendarSnapshot(c,undefined,input);
  assert.equal(s.sentCount,0);assert.equal(s.status,"draft");assert.equal(s.htmlMessage,c.htmlMessage);assert.equal(s.sourceFilter,"Manual");
  const t = {brandId:"abstract",channel:"email",subject:"new",body:"new copy"} as MessageTemplate;
  const changed = calendarSnapshot(c,t,input);
  assert.equal(changed.htmlMessage,null);assert.equal(changed.imageUrl,null);assert.equal(changed.subject,"new");assert.equal(c.message,"old");
  assert.throws(()=>calendarSnapshot(c,{...t,brandId:"ahava"},input));
  assert.throws(()=>calendarSnapshot(c,{...t,channel:"sms"},input));
  assert.throws(()=>calendarSnapshot(c,t,{...input,brandId:"ahava"}));
});
