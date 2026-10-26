import test from "node:test";
import assert from "node:assert/strict";
import { seoProjectInput, seoReportInput, seoTaskPatch, nextSeoTaskStatus, isNewerAudit } from "../src/lib/seo";
const report={entityId:"abstract",providerProjectId:"10593129",auditedAt:"2026-10-26T14:49:00Z",healthScore:100,internalPages:92,errorUrls:0,findings:[]};
test("SEO reports reject misleading totals, duplicate issue identities and unsafe URLs",()=>{
  assert.equal(seoReportInput.safeParse(report).success,true);
  assert.equal(seoReportInput.safeParse({...report,errorUrls:93}).success,false);
  const finding={key:"broken",title:"404 page",priority:"error",count:6,urls:["https://example.com/page"]};
  assert.equal(seoReportInput.safeParse({...report,findings:[finding,finding]}).success,false);
  assert.equal(seoReportInput.safeParse({...report,findings:[{...finding,urls:["https://example.com/?token=secret"]}]}).success,false);
  assert.equal(seoProjectInput.safeParse({entityId:"abstract",providerProjectId:"../../admin",website:"https://example.com"}).success,false);
});
test("IT cannot self-certify a repair, and partial or old imports cannot close work",()=>{
  assert.equal(seoTaskPatch.safeParse({id:"00000000-0000-4000-8000-000000000001",status:"verified_fixed"}).success,false);
  assert.equal(nextSeoTaskStatus("in_progress",false,false),"in_progress");
  assert.equal(nextSeoTaskStatus("fix_reported",true,true),"fix_reported");
  assert.equal(nextSeoTaskStatus("fix_reported",false,true),"verified_fixed");
  assert.equal(nextSeoTaskStatus("verified_fixed",true,true),"open");
  assert.equal(isNewerAudit(report.auditedAt,report.auditedAt),false);
  assert.equal(isNewerAudit("2026-10-26T08:44:00Z",report.auditedAt),false);
});
