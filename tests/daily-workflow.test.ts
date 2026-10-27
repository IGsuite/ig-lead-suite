import test from "node:test";
import assert from "node:assert/strict";
import { draftFields, draftFingerprint, smsSegmentCount } from "../src/lib/campaign-draft";
import { deliveryTotals, providerFailureReason } from "../src/lib/delivery-summary";
import type { Campaign } from "../src/lib/types";
const draft:Campaign={id:"draft",brandId:"abstract",programs:["HELOC"],name:"Review",channel:"email",subject:"Hello",message:"Hello {{firstName}}",sourceFilter:"all",groupFilter:"all",preferUnoffered:false,preferVerified:true,mode:"own",volume:2,throttlePerHour:20,status:"draft",sentCount:0,replyCount:0,optOutCount:0,bounceCount:0,sendWindowPreset:"custom",sendWindowStart:"09:00",sendWindowEnd:"20:00",timezone:"America/New_York",createdAt:"2026-10-26T12:00:00Z"};
test("draft revisions detect concurrent content, audience and schedule edits while normalizing empty optional fields",async()=>{
  const initial=await draftFingerprint(draft);
  assert.equal(initial,await draftFingerprint({...draft,imageUrl:null,htmlMessage:null,imageAlt:null}));
  for(const changed of [{message:"Different offer"},{volume:3},{sourceFilter:"manual-package:test"},{sendWindowStart:"10:00"},{programs:["SBA 504"]}])assert.notEqual(initial,await draftFingerprint({...draft,...changed}));
  assert.equal(initial,await draftFingerprint({...draft,sentCount:10}));
});
test("draft edits reject impossible amounts and malformed scheduling fields",()=>{
  assert.equal(draftFields.safeParse(draft).success,true);
  for(const changed of [{volume:0},{volume:1.5},{throttlePerHour:0},{timezone:"not-a-timezone"},{sendWindowStart:"29:99"},{message:""}])assert.equal(draftFields.safeParse({...draft,...changed}).success,false);
});
test("SMS preview estimates GSM extension and Unicode segments separately",()=>{
  assert.equal(smsSegmentCount(""),0);assert.equal(smsSegmentCount("a".repeat(160)),1);assert.equal(smsSegmentCount("a".repeat(161)),2);
  assert.equal(smsSegmentCount("^".repeat(80)),1);assert.equal(smsSegmentCount("^".repeat(81)),2);
  assert.equal(smsSegmentCount("界".repeat(70)),1);assert.equal(smsSegmentCount("界".repeat(71)),2);
});
test("delivery reporting never treats provider acceptance or processing completion as delivery",()=>{
  assert.deepEqual(deliveryTotals({queued:2,processing:1,accepted:4,sent:5,delivered:6,failed:1,bounced:2,uncertain:1,skipped:3}),{queued:3,accepted:4,sent:5,delivered:6,failed:3,uncertain:1,skipped:3});
  assert.equal(deliveryTotals({accepted:10}).delivered,0);
  const reason=providerFailureReason([{code:"40010",title:"Not registered",detail:"See https://provider.invalid/?token=private"}]);
  assert.match(reason,/40010/);assert.equal(reason.includes("token=private"),false);
});
