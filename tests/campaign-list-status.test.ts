import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignListStatus, type CampaignStatusEntry } from "../src/lib/campaign-list-status";
import type { CampaignStatus } from "../src/lib/types";

const parent = { id: "heloc", status: "draft" as CampaignStatus };
const day: CampaignStatusEntry = { campaignId: parent.id,runCampaignId:"camp-calendar-first",date:"2026-10-21",startTime:"09:00",endTime:"20:00",timezone:"America/New_York",status:"approved",snapshot:{volume:250} };
const morning = new Date("2026-10-21T12:00:00Z"), sendingTime = new Date("2026-10-21T14:00:00Z");

test("calendar blueprint shows pending with its next dated audience, then active during a sending run",()=>{
  const scheduled=campaignListStatus(parent,[day],true,new Map(),morning);
  assert.equal(scheduled.group,"pending");assert.equal(scheduled.status,"scheduled");assert.match(scheduled.detail!,/2026-10-21.*09:00.*250 contacts/);
  const run={id:day.runCampaignId,status:"sending" as CampaignStatus};
  const active=campaignListStatus(parent,[{...day,status:"started"}],true,new Map([[run.id,run]]),sendingTime);
  assert.equal(active.group,"active");assert.equal(active.status,"sending");
});
test("paused calendar, unapproved days, and expired windows never appear active or pending",()=>{
  assert.equal(campaignListStatus(parent,[day],false,new Map(),morning).group,"inactive");
  assert.equal(campaignListStatus(parent,[{...day,status:"draft"}],true,new Map(),morning).status,"draft");
  assert.equal(campaignListStatus(parent,[day],true,new Map(),new Date("2026-10-22T01:00:00Z")).group,"inactive");
  const run={id:day.runCampaignId,status:"sending" as CampaignStatus};
  assert.equal(campaignListStatus(run,[{...day,status:"started"}],false,new Map(),sendingTime).group,"inactive");
  assert.equal(campaignListStatus(run,[{...day,status:"paused"}],true,new Map(),sendingTime).group,"inactive");
});
test("completed calendar dates stay completed; both ordinary email and SMS share all lifecycle groups",()=>{
  assert.equal(campaignListStatus(parent,[{...day,status:"completed"}],true,new Map(),morning).group,"completed");
  for(const channel of ["email","sms"]){
    for(const [status,group] of [["draft","inactive"],["paused","inactive"],["scheduled","pending"],["sending","active"],["completed","completed"],["cancelled","cancelled"]] as const)
      assert.equal(campaignListStatus({id:channel,status},[],true,new Map()).group,group);
  }
});
