import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const header=html.match(/<header class="site-header"[^>]*>[\s\S]*?<\/header>/)[0];
const purchaseTag=header.match(/<a\b[^>]*class="bw-shared-audit"[^>]*>/)[0];
function harness(){
 const link={href:purchaseTag.match(/href="([^"]+)"/)[1]};
 const eligible=/\bdata-buy\b/.test(purchaseTag);
 const events=[],listeners={};
 const context={URL,linkId:'existing-result',last:null,beacon:name=>events.push(name),document:{querySelectorAll:selector=>selector==='a[data-buy]'&&eligible?[link]:[],addEventListener:(name,handler)=>{listeners[name]=handler}}};
 vm.createContext(context);
 const references=html.slice(html.indexOf('function eachBuy('),html.indexOf('// A result link can be deleted'));
 const handler=html.slice(html.indexOf("  document.addEventListener('click'",html.indexOf('// A buy click from a fresh result')),html.indexOf("  emailInput.addEventListener('input'"));
 vm.runInContext(references+'\n'+handler,context);
 return {link,context,events,click(){listeners.click({target:{closest:selector=>selector==='a[data-buy]'&&eligible?link:null},button:0})}};
}
test('header purchase participates in real result reference and optional email propagation',()=>{
 assert.match(purchaseTag,/\bdata-buy\b/);
 const ui=harness();
 ui.context.setReference('testresult');ui.context.setPrefill('test@example.invalid');
 const url=new URL(ui.link.href);
 assert.equal(url.origin+url.pathname,'https://broadcastwell.com/buy/audit');
 assert.equal(url.searchParams.get('client_reference_id'),'fc_testresult');
 assert.equal(url.searchParams.get('prefilled_email'),'test@example.invalid');
 ui.context.setReference(null);ui.context.setPrefill('');
 assert.equal(ui.link.href,'https://broadcastwell.com/buy/audit');
});
test('header purchase matches the real delegated buy handler',()=>{
 const ui=harness();ui.click();assert.deepEqual(ui.events,['buy_490']);
});
