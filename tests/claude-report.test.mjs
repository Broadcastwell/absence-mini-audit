import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import audit, {questionFrame} from '../lib/audit.js';
import {questionTemplate} from '../lib/analyze.js';
import {sealKey,verify} from '../lib/seal.js';
await import('../public/assets/report.js');
await import('../public/assets/wheel.js');
const R=globalThis.BwReport;
const PAGE=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const body={category:'CRM software',company:'acme.test',brand:'Acme'};
test('all fourteen published Index frames stay aligned in previews and handler fallback',()=>{
  const bank=globalThis.BwQuestionBank;
  assert.equal(bank.entries.length,14);
  for(const entry of bank.entries){
    assert.equal(entry.questions.length,10);
    assert.ok(entry.source.startsWith('https://index.broadcastwell.com/categories/'));
    for(const alias of entry.aliases){
      assert.deepEqual(questionFrame(alias),entry.questions);
      assert.deepEqual(questionTemplate(alias),entry.questions);
    }
  }
  assert.equal(questionFrame('CRM software')[0],'What is the best CRM for a growing B2B sales team?');
  assert.equal(questionFrame('construction management software')[0],'best construction management software for a small residential builder');
  assert.deepEqual(questionFrame(' CRM SOFTWARE '),questionFrame('CRM software'));
});
test('categories outside the Index retain the original generic question frame',()=>{
  assert.equal(globalThis.BwQuestionBank.get('video conferencing software'),null);
  assert.equal(questionFrame('video conferencing software')[0],'What is the best video conferencing software?');
  assert.equal(questionTemplate('video conferencing software')[0],'What is the best {category}?');
});
const rich=()=>({named:3,asked:10,tier:'named 1 to 3',chapter:'/category-door/',engine:'Claude',measured_on:'2026-10-20',questions:Array.from({length:10},(_,i)=>({question:'Buyer question '+(i+1),named:i<3,answer:i<3?'Acme and Peer A.':'Peer A and Peer B.',named_companies:i<3?['Acme','Peer A']:['Peer A','Peer B'],sources:i<3?['acme.test','peer.test']:['peer.test'],names_status:'extracted'})),named_instead:[{company:'Acme',count:3},{company:'Peer A',count:10},{company:'Peer B',count:7}],cited_sources:{domains:[{domain:'peer.test',count:10},{domain:'acme.test',count:3}],own_site_cited:3}});
function environment(seed={}){const store=new Map(Object.entries(seed));return {UPSTREAM_URL:'https://provider.invalid/run',UPSTREAM_TOKEN:'fixture-only-secret',AUDIT:{store,async get(k,type){const v=store.get(k);return v===undefined?null:type==='json'?JSON.parse(v):v;},async put(k,v){store.set(k,String(v));},async delete(k){store.delete(k);}},ASSETS:{fetch:async()=>new Response(PAGE,{headers:{'content-type':'text/html'}})}};}
const request=(value=body,ip='198.51.100.9')=>new Request('https://audit.broadcastwell.com/api/run',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':ip},body:JSON.stringify(value)});
async function run(env,value=body,ip){const response=await audit.fetch(request(value,ip),env);return {response,data:await response.json()};}
function provider(value){globalThis.fetch=async()=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});}

test('extended answer contract is typed, ordered, private-field free and excludes the visitor',async()=>{
  const value=rich();value.private_cost=99;value.questions[0].internal='private';provider(value);
  const {response,data}=await run(environment());
  assert.equal(response.status,200);
  assert.deepEqual(Object.keys(data).sort(),['asked','chapter','cited_sources','engine','measured_on','named','named_instead','questions','tier']);
  assert.equal(data.questions.length,10);assert.equal(data.questions.filter(r=>r.named).length,data.named);
  assert.deepEqual(data.questions.map(r=>r.question),value.questions.map(r=>r.question));
  assert.ok(data.questions.every(r=>typeof r.answer==='string'&&r.named_companies.every(n=>typeof n==='string')&&r.sources.every(s=>typeof s==='string')));
  assert.deepEqual(data.named_instead,[{company:'Peer A',count:10},{company:'Peer B',count:7}]);
  assert.equal(data.cited_sources.own_site_cited,3);assert.ok(!JSON.stringify(data).includes('private'));
});

test('legacy seven-field counts rebuild questions and keep unavailable detail unknown',async()=>{
  const value=rich();delete value.named_instead;delete value.cited_sources;value.questions=[];provider(value);
  const {data,response}=await run(environment());assert.equal(response.status,200);assert.equal(data.questions.length,10);
  assert.ok(data.questions.every(r=>r.status==='not itemised'&&!Object.hasOwn(r,'answer')));
  assert.deepEqual(data.named_instead,[]);assert.equal(data.cited_sources,null);
});

test('a partial extended answer set and inconsistent marks never become a result',async()=>{
  const partial=rich();partial.questions.pop();provider(partial);assert.equal((await run(environment())).response.status,502);
  const wrong=rich();wrong.named=4;provider(wrong);assert.equal((await run(environment())).response.status,502);
});

test('invalid own-site counts and non-text answers are refused',async()=>{
  for(const own of [-1,11,1.2,'3']){const value=rich();value.cited_sources.own_site_cited=own;provider(value);assert.equal((await run(environment())).response.status,502);}
  const value=rich();value.questions[0].answer={html:'unsafe'};provider(value);assert.equal((await run(environment())).response.status,502);
});

test('three failures are refunded and later failures consume allowance until the network gate stops calls',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls+=1;return new Response('{"private":"provider detail"}',{status:502});};
  const env=environment();const results=[];for(let i=0;i<9;i+=1)results.push(await run(env));
  assert.ok(results.slice(0,3).every(r=>r.data.refunded===true));assert.ok(results.slice(3,8).every(r=>r.data.refunded===false));
  assert.equal(results[8].response.status,429);assert.equal(calls,8);assert.match(results[8].data.message,/00:00 UTC/);
  assert.ok(results.every(r=>!JSON.stringify(r.data).includes('provider detail')));
});

test('workflow allowance stop is a clear outcome, releases reservations and creates no refund failure',async()=>{
  globalThis.fetch=async()=>new Response('{"status":"allowance_used","private":"not public"}',{status:503});
  const env=environment();const {response,data}=await run(env);assert.equal(response.status,503);assert.equal(data.reason,'allowance');assert.match(data.message,/\$490 Category Audit/);
  assert.ok([...env.AUDIT.store].filter(([k])=>k.startsWith('count:')).every(([k,v])=>!k.includes('refund')&&v==='0'));assert.ok(!JSON.stringify(data).includes('private'));
});

test('default network cap allows five and a refused request makes no upstream call',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls+=1;return new Response(JSON.stringify(rich()));};const env=environment();const statuses=[];
  for(let i=0;i<6;i+=1)statuses.push((await run(env)).response.status);
  assert.deepEqual(statuses,[200,200,200,200,200,429]);assert.equal(calls,5);
});

test('default site cap stops at sixty independently of network counters',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls+=1;return new Response(JSON.stringify(rich()));};const env=environment();
  for(let i=0;i<60;i+=1)assert.equal((await run(env,body,'198.51.100.'+(i+1))).response.status,200);
  assert.equal((await run(env,body,'198.51.100.200')).response.status,503);assert.equal(calls,60);
});

test('the seal covers full answers, names and every aggregate',async()=>{
  provider(rich());const env=environment();const {response,data}=await run(env);const key=await sealKey(env,false), given=response.headers.get('x-result-seal');
  assert.equal(await verify(key,body.brand,body.category,body.company,data,given),true);
  const edits=[r=>r.questions[0].answer+=' changed',r=>r.questions[0].named_companies.push('Other'),r=>r.named_instead[0].count=1,r=>r.cited_sources.own_site_cited=10];
  for(const edit of edits){const changed=structuredClone(data);edit(changed);assert.equal(await verify(key,body.brand,body.category,body.company,changed,given),false);}
});

test('enriched saved results retain their receipts and are served noindex',async()=>{
  provider(rich());const env=environment();const {response,data}=await run(env);
  const saved=await audit.fetch(new Request('https://audit.broadcastwell.com/api/link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({brand:body.brand,category:body.category,website:body.company,result:data,seal:response.headers.get('x-result-seal')})}),env);
  assert.equal(saved.status,200);const link=await saved.json();const record=JSON.parse(env.AUDIT.store.get('link:'+link.id));assert.deepEqual(record.result,data);
  const shared=await audit.fetch(new Request(link.url),env);const html=await shared.text();assert.equal(shared.status,200);assert.match(html,/name="robots" content="noindex/);assert.match(html,/"own_site_cited":3/);assert.match(html,/"answer":"Acme and Peer A\./);
});

test('company bars include the visitor at zero and source bars mark its actual domain',()=>{
  const value=rich();value.named=0;const companies=R.companies(value,body);assert.equal(companies[0].count,0);assert.equal(companies[0].own,true);
  const svg=R.bars(companies,'Companies');assert.match(svg,/Acme \(you\)/);assert.match(svg,/0\/10/);assert.match(svg,/tabindex="0"/);assert.match(svg,/#1D4ED8/);assert.match(svg,/#475569/);
  assert.equal(R.sources(value,body).find(r=>r.label==='acme.test').own,true);assert.equal(R.bars([],'Empty'),'');
});

test('all three offline export sizes show true score, top peers, citations and scope, with escaped labels',()=>{
  for(const [width,height] of [[1200,630],[1080,1080],[1600,900]]){
    const svg=R.card(rich(),{...body,brand:'Acme <unsafe>'},{width,height});assert.ok(svg.includes('width="'+width+'" height="'+height+'"'));assert.match(svg,/Named in 3 of 10/);assert.match(svg,/Peer A/);assert.match(svg,/10 of 10/);assert.match(svg,/Your site was cited in 3 of 10/);assert.match(svg,/Claude, ten questions, one run, measured on 2026-10-20/);assert.match(svg,/broadcastwell.com/);assert.match(svg,/Acme &lt;unsafe&gt;/);assert.ok(!/<script|\son\w+=|\sstyle=/.test(svg));
  }
});

test('legacy scope remains honest and full-answer display removes markdown punctuation without changing words',()=>{
  assert.ok(!R.scope({engine:'Perplexity',measured_on:'2026-09-01'}).startsWith('Claude'));
  const answer=R.plain('## Answer\n**Peer A**\n\u2014\n\x2d\x2d\x2d\nPeer B');assert.match(answer,/Peer A/);assert.match(answer,/Peer B/);assert.ok(!/[\u2013\u2014]|\x2d\x2d/.test(answer));
});

test('Claude results select the Claude wheel ring while legacy results keep their measured engine',()=>{
  const value=rich();value.questions=value.questions.map(r=>({...r,status:r.named?'named':'not named'}));const wheel=globalThis.BwWheel.fromFreeCheck(value,{brand:body.brand,category:body.category,website:body.company});assert.deepEqual(wheel.engines.filter(e=>e.measured).map(e=>e.id),['claude']);assert.equal(wheel.spokes[0].named.claude,true);assert.equal(wheel.spokes[9].named.claude,false);
});

function retryHarness(statuses){
  let calls=0,rendered=0;const timers=[],elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',scrollIntoView(){}});return elements.get(id);};
  const sandbox={WAIT_MS:75000,document:{getElementById:element},working:{},errorBox:{},errorMsg:{textContent:''},go:{disabled:false},result:{scrollIntoView(){}},emailCard:{},emailError:{},smooth:()=> 'auto',hide(){},show(){},stopProgress(){},startProgress(){},settle(){},setReference(){},drawWheel(){},drawReportCharts(){},renderResult(){rendered+=1;},refuse(){sandbox.go.disabled=false;},window:{setTimeout(fn,ms){const timer={fn,ms,cleared:false};timers.push(timer);return timer;},clearTimeout(timer){timer.cleared=true;}},fetch:async()=>{const status=statuses[Math.min(calls,statuses.length-1)];calls+=1;return new Response(JSON.stringify(status===200?rich():{reason:status===503?'allowance':'unavailable',message:status===503?'Allowance used.':'Claude did not answer all ten questions. This check was not counted. Try again in a few minutes.'}),{status});}};
  sandbox.WAIT_MS=Number(PAGE.match(/var WAIT_MS = (\d+)/)[1]);
  vm.createContext(sandbox);const start=PAGE.indexOf('  function runAttempt('),end=PAGE.indexOf("  form.addEventListener('submit'",start);vm.runInContext(PAGE.slice(start,end),sandbox);
  return {sandbox,timers,stats:()=>({calls,rendered}),flush:async()=>{for(let i=0;i<15;i+=1)await new Promise(resolve=>setImmediate(resolve));}};
}

test('the real upstream deadline allows ninety seconds and the browser leaves a delivery margin',async()=>{
  const original=AbortSignal.timeout;let observed;
  AbortSignal.timeout=milliseconds=>{observed=milliseconds;return original(milliseconds);};
  try {provider(rich());assert.equal((await run(environment())).response.status,200);assert.equal(observed,90000);} finally {AbortSignal.timeout=original;}
  const h=retryHarness([200]);h.sandbox.runAttempt(body,0);await h.flush();assert.ok(h.timers.some(timer=>timer.ms===95000));assert.equal(h.stats().rendered,1);
});

test('the page automatically retries one 502 after twenty seconds and never a third time',async()=>{
  const h=retryHarness([502,502]);h.sandbox.runAttempt(body,0);await h.flush();assert.equal(h.stats().calls,1);assert.equal(h.sandbox.go.disabled,true);const retry=h.timers.filter(t=>t.ms===20000);assert.equal(retry.length,1);retry[0].fn();await h.flush();assert.equal(h.stats().calls,2);assert.equal(h.stats().rendered,0);assert.equal(h.timers.filter(t=>t.ms===20000).length,1);assert.equal(h.sandbox.go.disabled,false);
});

test('retry success renders one result and a credit stop never retries',async()=>{
  const h=retryHarness([502,200]);h.sandbox.runAttempt(body,0);await h.flush();h.timers.find(t=>t.ms===20000).fn();await h.flush();assert.deepEqual(h.stats(),{calls:2,rendered:1});
  const stopped=retryHarness([503]);stopped.sandbox.runAttempt(body,0);await stopped.flush();assert.equal(stopped.stats().calls,1);assert.equal(stopped.timers.filter(t=>t.ms===20000).length,0);
});
