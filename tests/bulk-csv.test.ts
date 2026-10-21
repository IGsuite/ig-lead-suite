import { test } from "node:test";
import assert from "node:assert/strict";
import { csvRecords, csvHeaders, phoneKey } from "../src/lib/bulk-csv";
test("CSV byte checkpoints preserve multiline fields, escaped quotes, CRLF and UTF-8",()=>{
  const bytes=Buffer.from('email,name\r\na@company.invalid,"Josè\n\"\"Owner\"\""\r\nb@company.invalid,Next');
  const first=csvRecords(bytes,false,2);
  assert.deepEqual(first[1].values,['a@company.invalid','Josè\n"Owner"']);
  const rest=csvRecords(bytes.subarray(first[1].end),true);
  assert.deepEqual(rest[0].values,['b@company.invalid','Next']);
  assert.equal(first[1].end+rest[0].end,bytes.length);
  assert.deepEqual(csvHeaders(['E-Mail Address','Full Name']),['email_address','full_name']);
  assert.equal(phoneKey('+1 (516) 266-1301'),phoneKey('5162661301'));
});
test("CSV incomplete records are re-read at the checkpoint; malformed data is rejected",()=>{
  const bytes=Buffer.from('email,name\na@company.invalid,"unfinished');
  const records=csvRecords(bytes,false);
  assert.equal(records.length,1);
  assert.equal(records[0].end,11);
  assert.throws(()=>csvRecords(bytes,true),/quoted field/);
  assert.throws(()=>csvHeaders(['email','E mail']),/duplicate/);
  assert.throws(()=>csvRecords(Buffer.alloc(300000,97),false),/exceeds/);
});
