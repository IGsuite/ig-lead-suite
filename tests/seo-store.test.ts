import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { getPrisma } from "../src/lib/db";
import { ensureSeeded } from "../src/lib/neon-store-seed";
import { recordSeoReport } from "../src/lib/seo-store";
import { syncSeoProject } from "../src/lib/seo-ahrefs";
import { seoReportInput } from "../src/lib/seo";
import { seoIntegrationScope } from "../src/lib/seo-integration";
import { GET as events } from "../src/app/api/integrations/seo/events/route";

test("SEO imports persist without touching campaigns; duplicates, incomplete/old audits and missing pages cannot certify repairs",{timeout:60000},async()=>{
  process.env.DATABASE_URL="postgresql://postgres@127.0.0.1:55441/postgres";
  delete process.env.VERCEL;delete process.env.VERCEL_ENV;
  const pg=await PGlite.create();
  for(const migration of (await readdir("prisma/migrations")).filter(n=>/^\d/.test(n)).sort())await pg.exec(await readFile(`prisma/migrations/${migration}/migration.sql`,"utf8"));
  const server=new PGLiteSocketServer({db:pg,host:"127.0.0.1",port:55441});await server.start();
  const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:1});
  (globalThis as unknown as {pgPool:Pool}).pgPool=pool;
  const db=getPrisma(),originalFetch=globalThis.fetch;
  try{
    await ensureSeeded();
    const settings=await db.platformSettings.findMany(),campaigns=await db.campaign.findMany();
    await db.seoProject.create({data:{entityId:"abstract",providerProjectId:"10593129",website:"https://abstractcapitalgroup.com"}});
    const base={entityId:"abstract",providerProjectId:"10593129",auditedAt:"2026-10-20T12:00:00Z",healthScore:80,internalPages:100,errorUrls:20,complete:true,
      findings:[{key:"broken",title:"404 page",priority:"error" as const,count:6,recommendation:"Review links",urls:[]}]};
    await recordSeoReport(seoReportInput.parse(base),"manual_review");
    assert.equal((await db.seoReport.findFirstOrThrow()).complete,false);
    const task=await db.seoTask.findFirstOrThrow();
    await db.seoTask.update({where:{id:task.id},data:{status:"in_progress",assignee:"IT",notes:"Preserve this work"}});
    assert.equal((await recordSeoReport(seoReportInput.parse(base),"manual_review")).duplicate,true);
    assert.equal(await db.seoAlert.count(),1);
    await recordSeoReport(seoReportInput.parse({...base,auditedAt:"2026-10-21T12:00:00Z",findings:[]}),"manual_review");
    assert.equal((await db.seoTask.findFirstOrThrow()).status,"in_progress");
    // Even complete imports cannot infer repairs from omitted rows.
    await recordSeoReport(seoReportInput.parse({...base,auditedAt:"2026-10-22T12:00:00Z",findings:[]}),"ahrefs_api");
    assert.equal((await db.seoTask.findFirstOrThrow()).status,"in_progress");
    await recordSeoReport(seoReportInput.parse({...base,auditedAt:"2026-10-23T12:00:00Z",findings:[{...base.findings[0],count:0}]}),"ahrefs_api");
    assert.equal((await db.seoTask.findFirstOrThrow()).status,"verified_fixed");
    // Importing an older report must not reopen the current verified repair.
    await recordSeoReport(seoReportInput.parse({...base,auditedAt:"2026-10-19T12:00:00Z"}),"ahrefs_api");
    assert.equal((await db.seoTask.findFirstOrThrow()).status,"verified_fixed");
    await recordSeoReport(seoReportInput.parse({...base,auditedAt:"2026-10-24T12:00:00Z"}),"ahrefs_api");
    const reopened=await db.seoTask.findFirstOrThrow();assert.equal(reopened.status,"open");assert.equal(reopened.notes,"Preserve this work");assert.equal(reopened.assignee,"IT");
    // A different company's project mapping cannot be used.
    await assert.rejects(recordSeoReport(seoReportInput.parse({...base,entityId:"ahava"}),"ahrefs_api"),/matching Ahrefs project/);

    process.env.AHREFS_API_KEY="test-only";let calls=0;
    globalThis.fetch=async input=>{
      calls++;const url=new URL(String(input));
      assert.equal(url.origin,"https://api.ahrefs.com");assert.equal(url.searchParams.get("project_id"),"10593129");
      return Response.json(url.pathname.endsWith("/projects")?{healthscores:[{project_id:"10593129",target_url:"abstractcapitalgroup.com/",date:"2026-10-25T12:00:00",status:"Completed",health_score:100,total:100,urls_with_errors:0}]}:{issues:[{issue_id:"broken",name:"404 page",importance:"Error",crawled:0,missing:6}]});
    };
    await syncSeoProject("abstract");
    assert.equal((await db.seoTask.findFirstOrThrow()).status,"open","pages disappearing are not proof of repair");
    await syncSeoProject("abstract");assert.equal(calls,3,"duplicate crawl does not consume a second issues import");
    globalThis.fetch=async()=>Response.json({healthscores:[{project_id:"10593129",target_url:"different-company.invalid",date:"2026-10-25T12:00:00",status:"Completed"}]});
    await assert.rejects(syncSeoProject("abstract"),/different website/);

    // Integration stays denied by default; enabling requires a dedicated token and explicit company scope.
    delete process.env.COMMAND_CENTER_SEO_TOKEN;delete process.env.COMMAND_CENTER_SEO_ENTITIES;
    assert.equal(seoIntegrationScope(new Request("https://suite.invalid")),null);
    process.env.COMMAND_CENTER_SEO_TOKEN="test-only-".repeat(5);process.env.COMMAND_CENTER_SEO_ENTITIES="ahava";
    const response=await events(new Request("https://suite.invalid/api/integrations/seo/events",{headers:{authorization:`Bearer ${process.env.COMMAND_CENTER_SEO_TOKEN}`}}));
    assert.deepEqual((await response.json()).events,[],"company-scoped feed cannot leak Abstract alerts");
    assert.deepEqual(await db.platformSettings.findMany(),settings);assert.deepEqual(await db.campaign.findMany(),campaigns);
  }finally{
    globalThis.fetch=originalFetch;delete process.env.AHREFS_API_KEY;delete process.env.COMMAND_CENTER_SEO_TOKEN;delete process.env.COMMAND_CENTER_SEO_ENTITIES;
    await db.$disconnect();await pool.end();await server.stop();await pg.close();
  }
});
