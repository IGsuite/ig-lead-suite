import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

test("subscription migration preserves existing data and shared-company membership",async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE TABLE "Campaign"(id TEXT PRIMARY KEY,status TEXT); INSERT INTO "Campaign" VALUES (\'existing\',\'sending\');');
  await db.exec(await readFile(new URL("../prisma/migrations/202610230001_service_subscriptions/migration.sql",import.meta.url),"utf8"));
  await db.query('INSERT INTO "ServiceSubscription"(id,"companyIds",service,purpose,"loginUrl","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',["shared",["abstract","ahava"],"Email service","Marketing","https://example.com/login"]);
  const shared=await db.query('SELECT id FROM "ServiceSubscription" WHERE $1=ANY("companyIds")',["abstract"]);
  assert.equal(shared.rows.length,1);assert.equal((await db.query<{status:string}>('SELECT status FROM "Campaign" WHERE id=$1',["existing"])).rows[0].status,"sending");
  await assert.rejects(db.query('UPDATE "ServiceSubscription" SET "amountCents"=-1 WHERE id=$1',["shared"]));
 }finally{await db.close();}
});
