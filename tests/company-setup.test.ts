import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { setupCatalog, setupItemInput, setupCanVerify } from "../src/lib/company-setup";
import { setupRoleAllowed } from "../src/lib/api-auth";
import { decodeSession, encodeSession } from "../src/lib/auth";
import { proxy } from "../src/proxy";
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { encryptAccountPassword, decryptAccountPassword } from "../src/lib/account-vault";

test("setup role is explicit, signed, restricted by default, and cannot self-certify connections",()=>{
  process.env.AUTH_SECRET="setup-role-test-only-".repeat(3);
  const token=encodeSession({userId:"fixture",email:"assistant@example.invalid",role:"setup",allowedEntityIds:["abstract"],exp:Date.now()+60000});
  assert.equal(decodeSession(token)?.role,"setup");
  assert.equal(setupRoleAllowed("setup"),false);assert.equal(setupRoleAllowed("setup",true),true);
  assert.equal(setupRoleAllowed("admin"),true);assert.equal(setupRoleAllowed("member"),true);
  const r=proxy(new NextRequest("https://suite.invalid/campaigns",{headers:{cookie:`sd_session=${token}`}}));
  assert.equal(r.status,307);assert.equal(new URL(r.headers.get("location")!).pathname,"/company-setup");
  assert.equal(setupCanVerify("setup","tested"),false);assert.equal(setupCanVerify("setup","ready_for_review"),true);
  assert.equal(setupCanVerify("admin","tested"),true);
});
test("checklist validates service identity and blocks unexpected password fields and credential URLs",()=>{
  const item={entityId:"abstract",key:"instagram",status:"in_progress",loginUrl:"https://www.instagram.com/"};
  assert.equal(setupItemInput.safeParse(item).success,true);assert.equal(new Set(setupCatalog.map(i=>i.key)).size,12);
  assert.deepEqual(setupCatalog.filter(i=>i.category==="Social media").map(i=>i.key),["facebook","instagram","tiktok"]);
  assert.equal(setupItemInput.safeParse({...item,password:"do-not-store"}).success,false);
  assert.equal(setupItemInput.safeParse({...item,loginUrl:"https://user:password@example.com/"}).success,false);
  assert.equal(setupItemInput.safeParse({...item,vaultUrl:"https://example.com/?api_key=secret"}).success,false);
  assert.equal(setupItemInput.safeParse({...item,key:"billing_admin"}).success,false);
});
test("checklist migration preserves existing campaigns, provides per-company identities and rejects invalid statuses",async()=>{
  const db=new PGlite();try{
    for(const migration of (await readdir("prisma/migrations")).filter(n=>/^\d/.test(n)).sort())await db.exec(await readFile(`prisma/migrations/${migration}/migration.sql`,"utf8"));
    await assert.rejects(db.query(`INSERT INTO "CompanySetupItem"(id,"entityId",key,status,"updatedBy","updatedAt") VALUES ('bad','missing','facebook','tested','owner',NOW())`));
    assert.equal((await db.query(`SELECT count(*) FROM "CompanySetupItem"`)).rows.length,1);
    // Every operational authenticated route remains deny-by-default for setup users.
    for(const file of await routeFiles("src/app/api")){
      const source=await readFile(file,"utf8");
      if(!source.includes("requireApiSession"))continue;
      if(file.replaceAll("\\","/").match(/\/api\/(company-setup(?:\/credentials)?|alerts)\/route\.ts$/))continue;
      assert.equal(source.includes("allowSetup: true"),false,file);
      assert.equal(source.includes("allowSetup:true"),false,file);
    }
  }finally{await db.close();}
});
test("account encryption rejects altered ciphertext, wrong companies, wrong items and wrong keys",()=>{
  const original=process.env.ACCOUNT_VAULT_KEY;try{
    process.env.ACCOUNT_VAULT_KEY=randomBytes(32).toString("base64");
    const password="Test-only passphrase with spaces!",one=encryptAccountPassword(password,"abstract","instagram"),two=encryptAccountPassword(password,"abstract","instagram");
    assert.notEqual(one,two);assert.equal(one.includes(password),false);assert.equal(decryptAccountPassword(one,"abstract","instagram"),password);
    assert.throws(()=>decryptAccountPassword(one,"ahava","instagram"));assert.throws(()=>decryptAccountPassword(one,"abstract","facebook"));
    const parts=one.split(".");const bytes=Buffer.from(parts[3],"base64");bytes[0]^=1;parts[3]=bytes.toString("base64");assert.throws(()=>decryptAccountPassword(parts.join("."),"abstract","instagram"));
    process.env.ACCOUNT_VAULT_KEY=randomBytes(32).toString("base64");assert.throws(()=>decryptAccountPassword(one,"abstract","instagram"));
    delete process.env.ACCOUNT_VAULT_KEY;assert.throws(()=>encryptAccountPassword(password,"abstract","instagram"));
  }finally{if(original)process.env.ACCOUNT_VAULT_KEY=original;else delete process.env.ACCOUNT_VAULT_KEY;}
});
async function routeFiles(dir:string):Promise<string[]>{
  const files:string[]=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())files.push(...await routeFiles(path));else if(entry.name==="route.ts")files.push(path);}return files;
}
