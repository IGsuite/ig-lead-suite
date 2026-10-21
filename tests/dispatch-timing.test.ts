import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchWakeDelay, dispatchWakeSlot } from "../src/lib/dispatch-timing";

test("250 recipients at 25/hour finish inside the 11-hour window despite heartbeat rounding",()=>{
  const interval=3600000/25, claims:number[]=[];
  let now=0,nextDue=0;
  while(claims.length<250){
    if(now>=nextDue){claims.push(now);nextDue=now+interval;now+=1000;}
    else now+=dispatchWakeDelay(new Date(nextDue),now)*1000;
  }
  assert.ok(claims.at(-1)!<11*3600000);
  assert.ok(claims.slice(1).every((time,i)=>time-claims[i]>=interval),"Sending never exceeds the hourly throttle");
  assert.equal(dispatchWakeDelay(null,0),60);
  assert.equal(dispatchWakeDelay(new Date(-1),0),5,"Busy/overdue jobs cannot create a zero-delay loop");
});

test("the sub-minute wake is distinct from the minute message that triggered it",()=>{
  const minuteWake=dispatchWakeSlot(60,0);
  const nextWake=dispatchWakeSlot(24,60000);
  assert.notEqual(nextWake,minuteWake);
  assert.equal(dispatchWakeSlot(24,60001),nextWake,"Equivalent wake-ups share a short idempotency slot");
  assert.notEqual(dispatchWakeSlot(5,84000),nextWake,"An overdue retry receives a later slot");
});
