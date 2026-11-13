import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { firstFixDoor, firstFixRoom } from '../lib/fix-door.js';
import { PAGE_HEADERS } from '../lib/headers.js';

const original = readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const base = () => new Response(original,{headers:{...PAGE_HEADERS,'content-type':'text/html','x-robots-tag':'noindex'}});
test('when the audit door is off both fresh and saved results retain their full page and headers',async()=>{
  const response=base();
  assert.equal(await firstFixDoor(response,{}),response);
  assert.equal(await response.text(),original);
});
test('the first action changes while the attachment, saved-result data and paid alternatives survive',async()=>{
  const response=await firstFixDoor(base(),{FIX_AUDIT_DOOR:'true'});
  const page=await response.text();
  assert.match(page,/<h3>See your first fix<\/h3>/u);
  assert.match(page,/id="keep-result">See your first fix</u);
  assert.match(page,/\/signin\?next=first-fix&amp;keep=|\/signin\?next=first-fix&keep=/u);
  assert.match(page,/id="next-fix-link"/u);
  assert.match(page,/id="next-talk-link"/u);
  assert.match(page,/freshFixRoom\(reason\)/u);
  assert.equal(response.headers.get('x-robots-tag'),'noindex');
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/u);
  assert.doesNotMatch(response.headers.get('content-security-policy'),/unsafe-inline/u);
});
test('the capacity check never receives a domain, email, cookie, result ID or external destination',async()=>{
  const ask = new Request('https://audit.broadcastwell.com/api/first-fix-room');
  const env={FIX_AUDIT_DOOR:'true'};
  for(const disabled of [{}, {FIX_AUDIT_DOOR:'false'}]) {
    assert.equal((await firstFixRoom(ask,disabled,()=>assert.fail('unexpected network'))).status,404);
  }
  const yes = await firstFixRoom(ask,env,async(url,init)=>{
    assert.equal(url,'https://app.broadcastwell.com/api/fix/first-room');
    assert.equal(init.redirect,'error'); assert.equal(init.method,'GET');
    assert.equal(init.credentials,'omit'); return Response.json({available:true});
  });
  assert.deepEqual(await yes.json(),{available:true});
  for(const read of [()=>Response.json({available:'true'}),()=>new Response('error',{status:503}),()=>{throw Error('offline')}]) {
    assert.deepEqual(await (await firstFixRoom(ask,env,read)).json(),{available:false});
  }
});
