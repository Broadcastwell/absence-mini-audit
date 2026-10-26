import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
const page=fs.readFileSync('public/index.html','utf8');
test('owner Ready promise and current refund clocks stay exact',()=>{
 for(const text of ['We confirm Ready within 60 minutes during business hours. If anything is missing, a member of our team contacts you directly and finishes it with you. If Ready still cannot be reached, you can cancel for a full refund.','Due 48 elapsed hours after recorded Ready.','full $490 refund within five business days','full refund within 30 days of delivery'])assert.ok(page.includes(text),text);
 assert.doesNotMatch(page,/\$2,900|\$2,410|Get the Category Audit|Start with the \$490 Category Audit/);
});
test('entry-copy change preserves every byte of engine, limits, privacy and result logic',()=>{
 const hashes=JSON.parse(fs.readFileSync('tests/current-entry-logic-hashes.json','utf8'));
 for(const [file,hash] of Object.entries(hashes)){
  let source=fs.readFileSync(file,'utf8');
  if(file==='lib/audit.js')source=source.replaceAll('start with the $490 Answer Repair','start with the $490 Category Audit');
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'),hash,file);
 }
});
