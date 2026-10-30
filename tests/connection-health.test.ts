import test from "node:test";
import assert from "node:assert/strict";
import { credentialHealth, reportHealth, connectionEventChange, DAY, type ConnectionFinding } from "../src/lib/connection-health";
import { GET } from "../src/app/api/cron/connections/route";
import { proxy } from "../src/proxy";
import { NextRequest } from "next/server";
const now=new Date("2026-10-30T12:00:00Z");
test("expired, revoked and soon-expiring access need distinct action before report freshness",()=>{
  const config={revoked:false,expiresAt:new Date(now.getTime()+8*DAY).toISOString()};
  assert.equal(credentialHealth(config,now).state,"healthy");
  assert.equal(credentialHealth({...config,expiresAt:new Date(now.getTime()+7*DAY).toISOString()},now).state,"warning");
  assert.equal(credentialHealth({...config,expiresAt:now.toISOString()},now).state,"action_needed");
  assert.equal(credentialHealth({...config,revoked:true},now).state,"action_needed");
  assert.equal(reportHealth({receivedAt:null},now).state,"action_needed");
  assert.equal(reportHealth({receivedAt:new Date(now.getTime()-49*3600_000).toISOString()},now).state,"action_needed");
  assert.equal(reportHealth({receivedAt:now.toISOString()},now).state,"healthy");
});
test("unchanged faults remain acknowledged; recovery and a new fault reopen one durable alert",()=>{
  const bad:ConnectionFinding={entityId:"abstract",key:"google",itemKey:"google_ads",title:"Google Ads reports",...reportHealth({receivedAt:null},now)};
  const first=connectionEventChange(bad,null,now)!;assert.equal(first.acknowledgedAt,null);
  assert.equal(connectionEventChange(bad,{...first,acknowledgedAt:now},now),null);
  const good={...bad,...reportHealth({receivedAt:now.toISOString()},now)};
  const recovery=connectionEventChange(good,{...first,acknowledgedAt:now},now)!;
  assert.equal(recovery.acknowledgedAt,null);assert.match(recovery.message,/healthy/);
  assert.equal(connectionEventChange(good,recovery,now),null);
  assert.equal(connectionEventChange(bad,{...recovery,acknowledgedAt:now},now)?.acknowledgedAt,null);
  assert.equal(connectionEventChange(good,null,now)?.acknowledgedAt,now);
});
test("connection cron rejects missing, short and incorrect scheduler credentials before accessing data",async()=>{
  const previous=process.env.CRON_SECRET, previousAuth=process.env.AUTH_REQUIRED;
  try{
    process.env.AUTH_REQUIRED="true";
    assert.equal(proxy(new NextRequest("https://suite.invalid/api/cron/connections")).headers.get("x-middleware-next"),"1","scheduler reaches its own credential check without a user session");
    assert.equal(proxy(new NextRequest("https://suite.invalid/api/cron/connections/other")).status,401,"only the exact scheduler path skips session authentication");
    delete process.env.CRON_SECRET;assert.equal((await GET(new Request("https://suite.invalid/api/cron/connections"))).status,503);
    process.env.CRON_SECRET="x".repeat(40);assert.equal((await GET(new Request("https://suite.invalid/api/cron/connections"))).status,401);
    assert.equal((await GET(new Request("https://suite.invalid/api/cron/connections",{headers:{authorization:`Bearer ${"y".repeat(40)}`}}))).status,401);
  }finally{if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;if(previousAuth===undefined)delete process.env.AUTH_REQUIRED;else process.env.AUTH_REQUIRED=previousAuth;}
});
