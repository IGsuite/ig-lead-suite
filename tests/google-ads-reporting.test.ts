import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {googleReportSchema,newGoogleReportAccess,validGoogleReportAccess,validateGoogleReportTime,publicGoogleReport,googleAdsReportScript} from "../src/lib/google-ads-reporting";
const now=new Date("2026-10-27T15:00:00Z");
const report={accountId:"4209975325",collectedAt:now.toISOString(),dateStart:"2026-09-27",dateEnd:"2026-10-26",currency:"USD",timeZone:"America/New_York",campaigns:[{id:"24400697714",name:"Abstract campaign",status:"ENABLED",impressions:10,clicks:2,costMicros:1000000,conversions:0}]};
test("report keys reject incorrect, expired, revoked and other-company credentials",()=>{
 const {token,config}=newGoogleReportAccess(now);assert.ok(validGoogleReportAccess(`Bearer ${token}`,config,now));
 assert.equal(validGoogleReportAccess(`Bearer ${token}x`,config,now),false);assert.equal(validGoogleReportAccess(`Bearer ${token.replace('abstract','other')}`,config,now),false);
 assert.equal(validGoogleReportAccess(`Bearer ${token}`,{...config,revoked:true},now),false);assert.equal(validGoogleReportAccess(`Bearer ${token}`,config,new Date(config.expiresAt)),false);
 assert.equal(publicGoogleReport(config,1,now).state,"awaiting_report");assert.equal('hash' in publicGoogleReport(config,1,now),false);
});
test("reports are constrained to Abstract and reject incomplete or misleading metric rows",()=>{
 assert.ok(googleReportSchema.safeParse(report).success);
 for(const bad of [{...report,accountId:"7814576786"},{...report,dateStart:"2026-02-30"},{...report,dateEnd:"2026-08-01"},{...report,campaigns:[...report.campaigns,...report.campaigns]},{...report,campaigns:[{...report.campaigns[0],clicks:-1}]},{...report,unexpected:"data"}])assert.equal(googleReportSchema.safeParse(bad).success,false);
 assert.equal(validateGoogleReportTime(googleReportSchema.parse(report),now),true);
 assert.equal(validateGoogleReportTime(googleReportSchema.parse({...report,collectedAt:"2026-10-27T16:00:00Z"}),now),false);
 assert.equal(validateGoogleReportTime(googleReportSchema.parse(report),new Date("2026-10-28T15:00:00Z")),false);
});
test("stored reports become overdue, expire, and disappear after revocation",()=>{
 const {config}=newGoogleReportAccess(now);const received={...config,report:googleReportSchema.parse(report),receivedAt:now.toISOString()};
 assert.equal(publicGoogleReport(received,2,now).state,"receiving_reports");assert.equal(publicGoogleReport(received,2,new Date("2026-10-30T15:00:00Z")).state,"stale");
 assert.equal(publicGoogleReport({...received,revoked:true},3,now).report,null);assert.equal(publicGoogleReport(received,2,new Date(config.expiresAt)).state,"expired");
});
test("generated script reads the correct Google account and posts only to the fixed report endpoint",()=>{
 type FetchOptions={payload:string;headers:{Authorization:string}};
 const {token}=newGoogleReportAccess(now);let sent: {url:string;options:FetchOptions}|undefined;let queried="";
 const run=(accountId:string,status=200)=>{let rows=0;vm.runInNewContext(googleAdsReportScript(token)+"\nmain();",{
  AdsApp:{currentAccount:()=>({getCustomerId:()=>accountId,getCurrencyCode:()=>"USD",getTimeZone:()=>"America/New_York"}),search:(q:string)=>{queried=q;return {hasNext:()=>rows++===0,next:()=>({campaign:{id:24400697714,name:'One',status:'ENABLED'},metrics:{impressions:10,clicks:2,costMicros:1000000,conversions:0}})};}},
  Utilities:{formatDate:(d:Date)=>d.toISOString().slice(0,10)},UrlFetchApp:{fetch:(url:string,options:FetchOptions)=>{sent={url,options};return {getResponseCode:()=>status};}},Logger:{log:()=>{}}
 });};
 run("420-997-5325");assert.equal(sent?.url,"https://www.igleadsuite.com/api/webhooks/google-ads-report");assert.equal(sent?.options.headers.Authorization,`Bearer ${token}`);assert.equal(JSON.parse(sent!.options.payload).accountId,"4209975325");assert.match(queried,/LAST_30_DAYS/);
 assert.throws(()=>run("781-457-6786"),/Wrong company/);assert.throws(()=>run("420-997-5325",403),/not accepted/);
});
