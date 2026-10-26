import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("SEO migration isolates companies, preserves campaign data and rejects impossible report totals",async()=>{
  const db=new PGlite();try{
    await db.exec(`CREATE TABLE "Entity" (id TEXT PRIMARY KEY); INSERT INTO "Entity" VALUES ('abstract'),('ahava'); CREATE TABLE "Campaign"(id TEXT PRIMARY KEY,status TEXT);INSERT INTO "Campaign" VALUES ('existing','sending');`);
    await db.exec(await readFile(new URL("../prisma/migrations/202610260001_seo_command_center/migration.sql",import.meta.url),"utf8"));
    await db.query(`INSERT INTO "SeoProject"("entityId","providerProjectId",website,"updatedAt") VALUES ($1,$2,$3,NOW())`,["abstract","10593129","https://abstractcapitalgroup.com"]);
    await assert.rejects(db.query(`INSERT INTO "SeoProject"("entityId","providerProjectId",website,"updatedAt") VALUES ('missing','1','https://example.com',NOW())`));
    await assert.rejects(db.query(`INSERT INTO "SeoReport"(id,"entityId","providerProjectId","auditedAt",source,"healthScore","internalPages","errorUrls",findings) VALUES ('bad','abstract','10593129',NOW(),'manual_review',100,10,11,'[]')`));
    assert.equal((await db.query<{status:string}>(`SELECT status FROM "Campaign" WHERE id='existing'`)).rows[0].status,"sending");
    assert.equal((await db.query(`SELECT * FROM "SeoProject" WHERE "entityId"='ahava'`)).rows.length,0);
  }finally{await db.close();}
});
