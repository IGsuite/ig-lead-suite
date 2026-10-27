import test from "node:test";
import assert from "node:assert/strict";
import { smsRegistrationState, uniqueCompanyNumber, mailboxBelongsToCompany, setupReadiness } from "../src/lib/go-live";
test("Go live requires carrier provisioning and sender assignment separately", () => {
  assert.equal(smsRegistrationState({status:"ACTIVE",campaignStatus:"MNO_PENDING"},{assignmentStatus:"ASSIGNED"}),"pending");
  assert.equal(smsRegistrationState({status:"ACTIVE",campaignStatus:"MNO_PROVISIONED"},{}),"pending");
  assert.equal(smsRegistrationState({status:"ACTIVE",campaignStatus:"MNO_PROVISIONED"},{assignmentStatus:"ASSIGNED",tmobileNumberMappingStatus:"PENDING"}),"pending");
  assert.equal(smsRegistrationState({status:"ACTIVE",campaignStatus:"MNO_PROVISIONED"},{assignmentStatus:"ASSIGNED",tmobileNumberMappingStatus:"ADDED"}),"active");
  assert.equal(smsRegistrationState({status:"ACTIVE",campaignStatus:"MNO_PROVISIONED"},{assignmentStatus:"FAILED_ASSIGNMENT"}),"needs_attention");
});
test("Go live isolates normalized senders and mailbox domains by company", () => {
  assert.equal(uniqueCompanyNumber("+1 (516) 266-1301",[["5162661301"]]),false);
  assert.equal(uniqueCompanyNumber(undefined,[]),false);
  assert.equal(uniqueCompanyNumber("+15162661301",[["+12125551234"]]),true);
  assert.equal(mailboxBelongsToCompany("info@abstractcapitalgroup.com","abstractcapitalgroup.com"),true);
  assert.equal(mailboxBelongsToCompany("info@mail.abstractcapitalgroup.com","abstractcapitalgroup.com"),true);
  assert.equal(mailboxBelongsToCompany("info@otherabstractcapitalgroup.com","abstractcapitalgroup.com"),false);
  assert.equal(mailboxBelongsToCompany("info@other-company.com","abstractcapitalgroup.com"),false);
});
test("Saved setup information does not imply an active connection", () => {
  assert.equal(setupReadiness("ready_for_review"),"pending");
  assert.equal(setupReadiness("tested"),"active");
  assert.equal(setupReadiness("not_applicable"),"inactive");
  assert.equal(setupReadiness(),"not_connected");
});
