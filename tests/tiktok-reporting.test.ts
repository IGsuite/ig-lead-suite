import test from "node:test";
import assert from "node:assert/strict";
import { fetchTiktokReport, publicTiktokState, TIKTOK_ACCOUNT } from "../src/lib/tiktok-reporting";
const now = new Date("2026-11-04T01:00:00Z");
const row = {account_id:TIKTOK_ACCOUNT,username:"abstractcapitalgroup",is_business_account:"False",total_followers_count:55,following_count:"68",total_likes:533,videos_count:253,data_fetched_at:"2026-11-04T00:53:24"};
const response = (data:unknown) => async () => new Response(JSON.stringify({data}),{headers:{"content-type":"application/json"}});
test("TikTok request is read-only and fixed to Abstract; total followers are not daily net growth",async()=>{
  let calls=0;
  const fetcher:typeof fetch = async (input,options) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin,"https://connectors.windsor.ai");assert.equal(url.pathname,"/tiktok_organic");
    assert.equal(url.searchParams.get("select_accounts"),TIKTOK_ACCOUNT);assert.equal(url.searchParams.get("date_preset"),"today");
    assert.match(url.searchParams.get("fields")!,/total_followers_count/);assert.equal(options?.method,"GET");assert.equal(options?.redirect,"error");
    return response([row])();
  };
  const snapshot = await fetchTiktokReport("fixture-key",fetcher,now);
  assert.equal(calls,1);assert.equal(snapshot.followers,55);assert.equal(snapshot.following,68);assert.equal(snapshot.businessAccount,false);
  assert.equal(snapshot.fetchedAt,"2026-11-04T00:53:24.000Z");
  const state=publicTiktokState({entityId:"abstract",apiKey:"fixture-key",snapshot,revoked:false},1,now);
  assert.equal(state.state,"verified");assert.doesNotMatch(JSON.stringify(state),/fixture-key/);assert.equal(state.adsEnabled,false);
});
test("wrong accounts, mixed accounts, empty reports, invalid totals and stale/future data are rejected",async()=>{
  for (const data of [[],[row,row],[{...row,account_id:"other-company"}],[{...row,username:"personal-user"}],[{...row,total_likes:-1}],[{...row,total_likes:null}],[{...row,total_likes:"Infinity"}],[{...row,data_fetched_at:"2026-10-01T00:00:00Z"}],[{...row,data_fetched_at:"2027-01-01T00:00:00Z"}]]) {
    await assert.rejects(fetchTiktokReport("fixture-key",response(data),now),/could not verify/);
  }
});
test("provider failures, malformed responses and oversized bodies never expose upstream secrets",async()=>{
  const fetchers:typeof fetch[] = [async()=>{throw Error("https://provider?api_key=SECRET");},async()=>new Response("SECRET",{status:401}),async()=>new Response("not json SECRET"),async()=>new Response("x".repeat(50001))];
  for(const fetcher of fetchers) await assert.rejects(fetchTiktokReport("SECRET",fetcher,now),e=>e instanceof Error && !e.message.includes("SECRET") && /could not verify/.test(e.message));
});
test("failed reports retain dated totals but never claim an active healthy connection",async()=>{
  const snapshot=await fetchTiktokReport("fixture-key",response([row]),now);
  const stored={entityId:"abstract" as const,apiKey:"fixture-key",snapshot,revoked:false,lastFailureAt:now.toISOString()};
  assert.equal(publicTiktokState(stored,2,now).state,"needs_attention");
  const disconnected=publicTiktokState({...stored,revoked:true,apiKey:""},3,now);
  assert.equal(disconnected.state,"disconnected");assert.equal(disconnected.automaticRefreshEnabled,false);assert.deepEqual(disconnected.snapshot,snapshot);
  assert.equal(publicTiktokState({...stored,lastFailureAt:undefined},4,new Date("2026-11-07T01:00:00Z")).state,"stale");
});
