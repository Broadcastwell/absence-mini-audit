import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { firstFixDoor, firstFixRoom } from '../lib/fix-door.js';
import { PAGE_HEADERS } from '../lib/headers.js';
import { onRequest as savedPage } from '../functions/r/[[path]].js';
import { onRequest as embedPage } from '../functions/embed.js';
import { createHash } from 'node:crypto';

const original = readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const base = () => new Response(original,{headers:{...PAGE_HEADERS,'content-type':'text/html','x-robots-tag':'noindex'}});
const live = new Request('https://audit.broadcastwell.com/');
const on = {FIX_AUDIT_DOOR:'true'};
const previewOrigin = 'https://fix-preview.bw-client-data.pages.dev';
test('only an explicit product door and a recognized audit host can read capacity',async()=>{
 for(const [request,env] of [
   [new Request(live.url,{method:'POST'}),on],
   [new Request('https://malicious.invalid/'),on],
   [live,{FIX_AUDIT_DOOR:'false'}],
   [live,{FIX_AUDIT_DOOR:1}]
 ]) {
   const res=await firstFixRoom(request,env,()=>assert.fail('unexpected network'));
   assert.equal(res.status,404);
 }
});
test('compiled door leaves the measurement, allowances, question bank, and identity bytes pinned to main',()=>{
 const pins={'lib/audit.js':'0877c75eeb89d307d34edc7f3e13af27fbd0b8ae','lib/engine-core.js':'4d4dcc9114aef24d12660fcd56168967e3787d42','lib/health-core.js':'407a781ad043ce95df2b5a10022694b06f0a07f2','lib/identity.js':'f15af92a729446f6d6d20afa0223dbec478b0199','public/assets/question-bank.js':'97216660374ee3686bb0fa6b458719d6d73e3bde'};
 for(const [file,digest] of Object.entries(pins)){
   const bytes=readFileSync(new URL('../'+file,import.meta.url));
   assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),digest,file);
 }
});
test('embedded first action preserves its own frame ancestors and disabled asset response',async()=>{
 const request=new Request('https://audit.broadcastwell.com/embed');
 const headers=new Headers(PAGE_HEADERS);headers.set('content-type','text/html');
 const embedPolicy=readFileSync(new URL('../public/_headers',import.meta.url),'utf8').split('\n/embed\n')[1].match(/Content-Security-Policy: (.+)/)[1].trim();
 headers.set('content-security-policy',embedPolicy);headers.delete('x-frame-options');
 const asset=new Response(original,{headers});
 assert.equal(await embedPage({request,env:{},next:()=>asset}),asset);
 const enabled=await embedPage({request,env:on,next:()=>asset});
 assert.equal(enabled.headers.get('x-frame-options'),null);
 assert.equal(enabled.headers.get('content-security-policy').split('frame-ancestors ')[1],embedPolicy.split('frame-ancestors ')[1]);
 assert.match(await enabled.text(),/id="keep-result">See your first fix</);
});
test('production and preview keep their own account origins for both handoff and the capacity probe', async()=>{
 for(const [audit,app,configured] of [
   [live.url,'https://app.broadcastwell.com',previewOrigin],
   ['https://trial.absence-mini-audit.pages.dev/',previewOrigin,undefined],
   ['https://trial.absence-mini-audit.pages.dev/','https://paired.bw-client-data.pages.dev','https://paired.bw-client-data.pages.dev'],
   ['https://trial.absence-mini-audit.pages.dev/',previewOrigin,'https://paired.bw-client-data.pages.dev.evil.invalid'],
   ['http://127.0.0.1:8789/','http://127.0.0.1:8788',undefined],
 ]) {
   const request=new Request(audit),env={...on,FIX_AUDIT_PREVIEW_APP_ORIGIN:configured};
   const page=await firstFixDoor(base(),env,request);
   assert.ok((await page.text()).includes('var APP_ORIGIN = '+JSON.stringify(app)+';'));
   const answer=await firstFixRoom(request,env,async(url,options)=>{
     assert.equal(url,app+'/api/fix/first-room');assert.equal(options.referrerPolicy,'no-referrer');
     return Response.json({available:true,private_value:'discard'});
   });
   assert.deepEqual(await answer.json(),{available:true});
 }
});
test('a saved record retains noindex, hides its URL from referrers and exposes a working first action beside the score', async()=>{
 const oldCopy='Create a free account, no card. It keeps this check, and for 14 days it opens the tracking screens on ten buyer questions for your category, with up to three one-engine runs.';
 const id='a'.repeat(32),record={id,brand:'Synthetic Studio',website:'synthetic.example',category:'design',result:{named:2,asked:10,questions:[{question:oldCopy}]},expires_on:'2026-12-10'};
 const request=new Request('https://trial.absence-mini-audit.pages.dev/r/'+id);
 const env={...on,ASSETS:{fetch:base},AUDIT:{get:async()=>record}};
 const response=await savedPage({request,env});
 assert.equal(response.status,200);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
 const page=await response.text();
 assert.match(page,/<button[^>]*id="score-next-link"[^>]*>See your first fix<\/button>/);
 assert.doesNotMatch(page,/scoreNext.href = '#next-keep'/);
 assert.ok(page.includes("referrerPolicy:'no-referrer'"));assert.ok(page.includes('aria-live="polite"'));
 assert.deepEqual(JSON.parse(/<script type="application\/json" id="shared-result">([\s\S]*?)<\/script>/.exec(page)[1]),record);
 const expired=await savedPage({request,env:{...env,AUDIT:{get:async()=>null}}});
 assert.equal(expired.status,404);assert.equal(expired.headers.get('referrer-policy'),'no-referrer');
 assert.doesNotMatch(await expired.text(),/id="keep-result">See your first fix/);
});
test('when the audit door is off both fresh and saved results retain their full page and headers',async()=>{
  const response=base();
  assert.equal(await firstFixDoor(response,{}),response);
  assert.equal(await response.text(),original);
});
test('the first action changes while the attachment, saved-result data and paid alternatives survive',async()=>{
  const response=await firstFixDoor(base(),{FIX_AUDIT_DOOR:'true'},live);
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
    assert.equal(init.redirect,'manual'); assert.equal(init.method,'GET');
    assert.equal(init.credentials,'omit'); return Response.json({available:true});
  });
  assert.deepEqual(await yes.json(),{available:true});
  for(const read of [()=>Response.json({available:'true'}),()=>Response.redirect('https://elsewhere.invalid/'),()=>new Response('error',{status:503}),()=>{throw Error('offline')}]) {
    assert.deepEqual(await (await firstFixRoom(ask,env,read)).json(),{available:false});
  }
});
