import test from "node:test";
import assert from "node:assert/strict";
import {subscriptionInput,subscriptionTotals} from "../src/lib/subscriptions";
const row=subscriptionInput.parse({companyIds:["abstract","ahava"],service:"Shared service",purpose:"Email",loginUrl:"https://example.com/login",amountCents:9400,status:"active"});
test("subscription inventory rejects embedded secrets and unexpected password fields",()=>{
 for(const loginUrl of ["javascript:alert(1)","http://example.com","https://user:pass@example.com","https://example.com/?api_key=secret"])
  assert.equal(subscriptionInput.safeParse({...row,loginUrl}).success,false);
 assert.equal(subscriptionInput.safeParse({...row,password:"secret"}).success,false);
 assert.equal(subscriptionInput.safeParse({...row,renewalDate:"2026-02-30"}).success,false);
});
test("shared bills count once; annual currencies and unpriced usage remain separate",()=>{
 const monthly={...row,id:"one"};const annual={...row,id:"two",billingCycle:"annual" as const,amountCents:12000,currency:"EUR" as const};
 const result=subscriptionTotals([monthly,monthly,annual,{...row,id:"three",billingCycle:"usage"},{...row,id:"four",status:"cancelled"}]);
 assert.deepEqual(result,{monthly:{USD:9400,EUR:1000},unpriced:1});
});
