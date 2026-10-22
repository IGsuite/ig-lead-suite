import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { getPrisma } from "../src/lib/db";
import { commitImportChunk } from "../src/lib/bulk-import";
import { listLeads } from "../src/lib/lead-list";
import { attachLeadSummary } from "../src/lib/lead-summary";
import { createSeedData, STORE_VERSION } from "../src/lib/seed";
import { entityPerformanceScores, poolSourceResults } from "../src/lib/analytics";
import { verifyLeads } from "../src/lib/neon-store-ops";

test("bulk imports checkpoint atomically, preserve source membership and suppressions, and paginate large pools",{timeout:600000},async()=>{
  process.env.DATABASE_URL="postgresql://postgres@127.0.0.1:55440/postgres";
  delete process.env.VERCEL;delete process.env.VERCEL_ENV;
  const pg=await PGlite.create();
  for(const migration of (await readdir('prisma/migrations')).filter(n=>/^\d/.test(n)).sort())await pg.exec(await readFile(`prisma/migrations/${migration}/migration.sql`,'utf8'));
  const server=new PGLiteSocketServer({db:pg,host:'127.0.0.1',port:55440});await server.start();
  const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:1});
  (globalThis as unknown as {pgPool:Pool}).pgPool=pool;
  const db=getPrisma();
  try {
    const total=Number(process.env.BULK_STRESS_ROWS||5000);
    const job=await db.leadImportJob.create({data:{id:'import-stress',requestId:'request-stress',ownerId:'local',environment:'local',filename:'stress.csv',blobPath:'uploads/local/lead-imports/stress.csv',csvPath:'uploads/local/lead-imports/stress.csv',sizeBytes:total,csvBytes:total,source:'Enablement fixture',groupName:'Large import fixture',purchaseDate:new Date('2026-10-21'),costCents:1000}});
    await db.optOut.create({data:{id:'suppressed',contact:'person0@company.invalid',channel:'email',reason:'fixture'}});
    const started=Date.now();
    for(let offset=0;offset<total;offset+=1000){
      const current=await db.leadImportJob.findUniqueOrThrow({where:{id:job.id}});
      const rows=Array.from({length:Math.min(1000,total-offset)},(_,i)=>({email:`person${offset+i}@company.invalid`,phone:offset+i===1?'bad phone':undefined}));
      assert.equal(await commitImportChunk(current,rows,['email','phone'],offset+rows.length),true);
      // Same chunk delivered again must not change counts or spend.
      if(offset===0)assert.equal(await commitImportChunk(current,rows,['email','phone'],offset+rows.length),false);
    }
    const completed=await db.leadImportJob.findUniqueOrThrow({where:{id:job.id}});
    assert.equal(completed.status,'completed');assert.equal(completed.importedCount,total);assert.equal(completed.suppressedCount,1);
    assert.equal(await db.leadImportMembership.count(),total);
    const first=await listLeads({folder:'valid'});assert.equal(first.leads.length,100);assert.equal(first.filteredCount,total-1);assert.equal(first.stats.valid,total-1);
    assert.equal(first.stats.invalid,0,'bad phone must not quarantine a valid email');
    const next=await listLeads({folder:'valid',cursor:first.nextCursor!});assert.ok(next.leads.every(l=>!first.leads.some(old=>old.id===l.id)));
    const second=await db.leadImportJob.create({data:{...job,headers:[],id:'import-second',requestId:'request-second',offset:0,csvBytes:1,sizeBytes:1,costCents:0}});
    await commitImportChunk(second,[{email:' PERSON1@company.invalid '},{email:'invalid contact',phone:'bad'}],['email','phone'],1);
    assert.equal((await db.leadImportJob.findUniqueOrThrow({where:{id:second.id}})).duplicateCount,1);
    assert.equal(await db.leadImportMembership.count({where:{jobId:second.id}}),2);
    const junk=await listLeads({folder:'invalid'});assert.equal(junk.filteredCount,1);
    await db.platformSettings.create({data:{id:'default',version:STORE_VERSION,entityOrder:[]}});
    await db.lead.update({where:{id:'import-stress-1'},data:{emailStatus:'invalid',verifyNotes:'Mailbox not found',verifiedAt:new Date('2026-10-20T00:00:00Z')}});
    assert.deepEqual(await verifyLeads({leadIds:[],onlyUnverified:false}),{verified:0,invalid:0,risky:0});
    await verifyLeads({leadIds:['import-stress-1'],onlyUnverified:false});
    const rejected=await db.lead.findUniqueOrThrow({where:{id:'import-stress-1'}});
    assert.equal(rejected.emailStatus,'invalid','format recheck must preserve a real mailbox rejection');
    assert.equal(rejected.phoneStatus,'invalid');
    assert.match(rejected.verifyNotes!,/Mailbox not found/);
    assert.equal(rejected.verifiedAt!.toISOString(),'2026-10-20T00:00:00.000Z');
    const web=await attachLeadSummary({...createSeedData(),leads:[],replies:[],campaigns:[],providerSpend:[]});
    assert.equal(web.leadSummary.total,total+1);
    assert.equal(web.leads.length,100,'platform must not download the full pool');
    assert.equal(entityPerformanceScores(web,'all','email').offered,total+1);
    assert.equal(poolSourceResults(web,'email')[0].offered,total+1);
    assert.equal((await db.providerSpend.findUniqueOrThrow({where:{source:job.source}})).costCents,1000);
    assert.equal(await db.sendJob.count(),0);assert.equal(await db.campaign.count(),0);
    console.log(JSON.stringify({stressRows:total,elapsedSeconds:Math.round((Date.now()-started)/1000),pageSize:first.leads.length,exactlyOnce:true,noSending:true}));
  }finally{await db.$disconnect();await pool.end();await server.stop();await pg.close();}
});
