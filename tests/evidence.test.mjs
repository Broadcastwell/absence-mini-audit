import {test} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../lib/audit.js';
import {onRequest,PREVIEW_HOSTS} from '../functions/api/run.js';
test('unapproved preview hosts never touch production counters or the paid engine',async()=>{const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('must not call upstream');};try{const response=await onRequest({request:new Request('https://unapproved.absence-mini-audit.pages.dev/api/run',{method:'POST'}),env:new Proxy({},{get(){throw Error('must not read a binding');}})});assert.equal(response.status,503);assert.equal((await response.json()).message,'This check is awaiting activation.');}finally{globalThis.fetch=old;}});
function environment(){const values=new Map();return {AUDIT:{async get(k,type){const v=values.get(k);return type==='json'?v?JSON.parse(v):null:v;},async put(k,v){values.set(k,v);}},UPSTREAM_URL:'https://upstream.invalid/run',UPSTREAM_TOKEN:'synthetic-only'};}
const request=()=>new Request('https://preview.example/api/run',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body:JSON.stringify({category:'CRM',company:'Synthetic',email:'synthetic@example.test'})});
const result=()=>({named:0,asked:10,tier:'named 0 of 10',chapter:'/category-door/',engine:'Perplexity',questions:Array.from({length:10},(_,i)=>({question:'Synthetic question '+(i+1),status:'not named',answer:'Recorded synthetic answer. '.repeat(40),alternatives:Array.from({length:40},(_,n)=>'Synthetic alternative '+n),sources:Array.from({length:40},(_,n)=>'https://evidence.example/page/'+n),internal_key:'never disclose'}))});
test('full recorded answers, alternatives and page sources survive the narrow public contract',async()=>{const old=globalThis.fetch,value=result();globalThis.fetch=async()=>new Response(JSON.stringify(value));try{const response=await run(request(),environment());assert.equal(response.status,200);const body=await response.json();assert.equal(body.questions[0].answer,value.questions[0].answer);assert.equal(body.questions[0].alternatives.length,40);assert.equal(body.questions[0].sources.length,40);assert.equal(body.questions[0].source_urls_omitted,0);assert.ok(!JSON.stringify(body).includes('internal_key'));}finally{globalThis.fetch=old;}});
test('unsafe links are omitted explicitly and oversized evidence cannot appear complete',async()=>{const old=globalThis.fetch,value=result();value.questions[0].sources.push('javascript:alert(1)','https://user:password@evidence.example');globalThis.fetch=async()=>new Response(JSON.stringify(value));try{let body=await (await run(request(),environment())).json();assert.equal(body.questions[0].sources.length,40);assert.equal(body.questions[0].source_urls_omitted,2);value.questions[0].answer='x'.repeat(20001);body=await (await run(request(),environment())).json();assert.deepEqual(body.questions,[]);}finally{globalThis.fetch=old;}});

// The preview host gate. It used to name a hostname Cloudflare Pages cannot create,
// because Pages truncates a branch alias to 28 characters, so the preview free-check
// path was unreachable and answered "awaiting activation" to every request. These hold
// the three states apart: the wrong host never reads a binding, the right host with the
// wrong payload is refused before anything is called, and the right host with the
// approved sample reaches the handler.
test('the preview gate names a host Pages can actually serve', async () => {
  const alias = [...PREVIEW_HOSTS].find(host => host.startsWith("phase1-free-evidence-2026-09."));
  assert.ok(alias, 'the 28 character branch alias must be listed');
  for (const host of PREVIEW_HOSTS) {
    const label = host.split('.')[0];
    assert.ok(label.length <= 28 || host === 'phase1-free-evidence-2026-09-14.absence-mini-audit.pages.dev');
  }
});

test('the approved preview host refuses anything but the approved sample, without calling out', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('must not call upstream'); };
  try {
    for (const host of PREVIEW_HOSTS) {
      const response = await onRequest({
        request: new Request(`https://${host}/api/run`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ company: 'someone.else', category: 'CRM', email: 'someone@example.test' })
        }),
        env: { FREE_CHECK_PREVIEW: 'true', LIMITS_DB: {} }
      });
      assert.equal(response.status, 403, host);
      assert.equal((await response.json()).message, 'This preview accepts only the approved synthetic sample.');
    }
  } finally { globalThis.fetch = old; }
});

test('the preview stays shut while its flag is off, whatever the host', async () => {
  for (const host of PREVIEW_HOSTS) {
    const response = await onRequest({
      request: new Request(`https://${host}/api/run`, { method: 'POST' }),
      env: new Proxy({ FREE_CHECK_PREVIEW: 'false' }, { get(target, key) { if (key === 'FREE_CHECK_PREVIEW') return 'false'; throw Error('must not read a binding'); } })
    });
    assert.equal(response.status, 503, host);
  }
});
