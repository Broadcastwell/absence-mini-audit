import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import {SHARED_NAV} from '../scripts/site-chrome.mjs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const header=html.match(/<header class="bw-site-nav"[^>]*>[\s\S]*?<\/header>/)[0];
// Today's header (SHARED_NAV off) draws its purchase action in the desktop bar, the phone bar and the
// phone menu; the shared header (on) has none, so these tests hold for the committed switch.
const purchaseTags=header.match(/<a\b[^>]*href="https:\/\/broadcastwell\.com\/buy\/answer-repair"[^>]*>/g)||[];
const purchaseTag=purchaseTags[0]||'<a href="https://broadcastwell.com/buy/answer-repair">';
function harness(){
 const link={href:purchaseTag.match(/href="([^"]+)"/)[1]};
 const eligible=/\bdata-buy\b/.test(purchaseTag);
 const events=[],listeners={};
 const context={URL,linkId:'existing-result',last:null,beacon:name=>events.push(name),document:{querySelectorAll:selector=>selector==='a[data-buy]'&&eligible?[link]:[],getElementById:()=>({addEventListener(){}}),addEventListener:(name,handler)=>{listeners[name]=handler}}};
 vm.createContext(context);
 const references=html.slice(html.indexOf('function eachBuy('),html.indexOf('// A result link can be deleted'));
 const handler=html.slice(html.indexOf("  document.addEventListener('click'",html.indexOf('// A buy click from a fresh result')),html.indexOf("  emailInput.addEventListener('input'"));
 vm.runInContext(references+'\n'+handler,context);
 return {link,context,events,click(){listeners.click({target:{closest:selector=>selector==='a[data-buy]'&&eligible?link:null},button:0})}};
}
test('the header purchase action is drawn only while today\'s links are on, and every copy of it carries data-buy',()=>{
 if(SHARED_NAV){assert.equal(purchaseTags.length,0);return;}
 assert.equal(purchaseTags.length,3);
 for(const tag of purchaseTags){assert.match(tag,/\bdata-buy\b/);assert.match(tag,/class="bw-button bw-button--secondary/);}
});
test('header purchase participates in real result reference and optional email propagation',{skip:SHARED_NAV&&'the shared header has no purchase action'},()=>{
 assert.match(purchaseTag,/\bdata-buy\b/);
 const ui=harness();
 ui.context.setReference('testresult');ui.context.setPrefill('test@example.invalid');
 const url=new URL(ui.link.href);
 assert.equal(url.origin+url.pathname,'https://broadcastwell.com/buy/answer-repair');
 assert.equal(url.searchParams.get('client_reference_id'),'fc_testresult');
 assert.equal(url.searchParams.get('fc'),'testresult');
 assert.equal(url.searchParams.get('prefilled_email'),'test@example.invalid');
 ui.context.setReference(null);ui.context.setPrefill('');
 assert.equal(ui.link.href,'https://broadcastwell.com/buy/answer-repair');
});
test('header purchase matches the real delegated buy handler',{skip:SHARED_NAV&&'the shared header has no purchase action'},()=>{
 const ui=harness();ui.click();assert.deepEqual(ui.events,['buy_490']);
});
