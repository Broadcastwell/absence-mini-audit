import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const mode=fs.existsSync(new URL('mkdocs.yml',root))?'docs':fs.existsSync(new URL('site-chrome.js',root))?'index':'audit';
const html=mode==='docs'?read('overrides/partials/site-header.html')+read('overrides/partials/site-footer.html'):read(mode==='audit'?'public/index.html':'index.html');
const css=mode==='docs'?read('docs/assets/site-chrome.css'):mode==='index'?read('styles.css'):html;
const script=mode==='docs'?read('docs/assets/site-chrome.js'):mode==='index'?read('site-chrome.js'):read('scripts/site-chrome.js');
const navLabels=['Product','Research','Free tools','Pricing','Exchange','Company'];
const footerLabels=[
 ['Product',['Category Audit, $490','Fix Sprint','The program','For agencies','Pricing','Connect an assistant']],
 ['Research',['Absence Index','Public Fix','The 2026 State of GEO','Studies','Methodology','Data and citations']],
 ['Free tools',['Free 10-question check (one engine)','llms.txt generator','Record check (free)','Agency comparisons','Sample account','Developers']],
 ['Company',['About','Company facts','Careers','Exchange','Partner Network','Security']],
 ['Contact',['hello@broadcastwell.com','Contact page','LinkedIn','Writing','Sitemap','Questions and answers']]
];
test('six site navigation destinations and separate sign in and outlined Audit action',()=>{
 if(mode==='audit')assert.equal(html.match(/\/\* site chrome: begin \*\/\n([\s\S]*?)\n\/\* site chrome: end \*\//)[1],script.replace(/\r\n?/g,'\n').trim(),'the single inline controller matches its authored source');
 const nav=html.match(/<nav class="bw-shared-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
 assert.deepEqual([...nav.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map(x=>x[1]),navLabels);
 assert.match(html,/class="bw-shared-audit" href="https:\/\/broadcastwell.com\/buy\/audit" aria-label="Get the Category Audit, \$490">\$490 Audit<\/a>/);
 assert.match(css,/\.bw-shared-audit\s*\{[^}]*min-height:44px;[^}]*border-radius:9px;[^}]*background:transparent/);
 assert.match(html,/href="https:\/\/app.broadcastwell.com\/signin">Sign in<\/a>/);
 assert.match(css,/height:64px/);
 assert.match(css,/--bw-font:"Inter",system-ui,sans-serif/);
});
test('footer has exactly five groups of six and preserves contact and legal details',()=>{
 const groups=[...html.matchAll(/<details class="bw-shared-group"[^>]*>([\s\S]*?)<\/details>/g)];
 assert.equal(groups.length,5);
 groups.forEach((group,i)=>{
   assert.equal(group[1].match(/<h2[^>]*>([^<]+)<\/h2>/)[1],footerLabels[i][0]);
   assert.deepEqual([...group[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map(x=>x[1].replace(/<wbr\s*\/?>/g,'')),footerLabels[i][1]);
 });
 assert.match(html,/<a href="mailto:hello@broadcastwell.com">hello@<wbr>broadcastwell.com<\/a>/);
 assert.match(html,/517 E Kirkwood Ave<br>Bloomington, IN 47408<br>United States/);
 assert.match(html,/href="tel:\+18123457272">\(812\) 345 7272/);
 assert.match(html,/<time datetime="\d{4}-\d{2}-\d{2}">/);
 assert.match(html,/<p class="bw-shared-allowance"><strong>Free 10-question check \(one engine\):<\/strong> No email is needed; runs are limited per network and per day, and by the site's daily allowance\.<\/p>/);
 assert.match(css,/\.bw-shared-allowance\s*\{[^}]*font-size:15px/);
 for(const slug of ['terms','privacy','cookies'])assert.ok(html.includes(`href="https://broadcastwell.com/${slug}"`));
 assert.match(css,/@media\(max-width:809px\)/);
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(script,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|sendBeacon/);
});
function element(){
 const listeners={},attrs={};
 return {open:true,listeners,attrs,focused:false,addEventListener(name,callback){listeners[name]=callback},setAttribute(name,value){attrs[name]=value},getAttribute(name){return attrs[name]},removeAttribute(name){delete attrs[name]},focus(){this.focused=true}};
}
function simulate(width){
 const footerQuery={matches:width<=809},headerQuery={matches:width<=1099};
 for(const query of [footerQuery,headerQuery]){query.listeners=[];query.addEventListener=(_type,fn)=>query.listeners.push(fn)}
 const groups=Array.from({length:5},()=>{const group=element();group.summary=element();group.link=element();group.querySelector=()=>group.summary;group.contains=target=>target===group.summary||target===group.link;return group});
 const menu=element();menu.open=false;menu.summary=element();menu.link=element();menu.querySelector=()=>menu.summary;menu.contains=target=>target===menu.summary||target===menu.link;
 const menus=[menu],header=element(),desktopLink=element(),wordmark=element(),documentListeners={},listenerCounts={};
 menu.closest=()=>header;header.querySelector=()=>wordmark;header.querySelectorAll=()=>[desktopLink,wordmark,menu.link];header.contains=target=>menu.contains(target)||target===desktopLink||target===wordmark;
 menu.link.setAttribute('href','https://broadcastwell.com/free-tools');desktopLink.setAttribute('href','https://broadcastwell.com/free-tools');desktopLink.closest=()=>desktopLink;
 const document={activeElement:null,querySelectorAll:s=>s==='[data-bw-footer-group]'?groups:s==='[data-bw-site-menu]'?menus:[header],addEventListener:(name,fn)=>{documentListeners[name]=fn;listenerCounts[name]=(listenerCounts[name]||0)+1}};
 for(const node of [menu.summary,menu.link,desktopLink,wordmark,...groups.flatMap(group=>[group.summary,group.link])])node.focus=function(){this.focused=true;document.activeElement=this};
 const window={scrollY:0,matchMedia:s=>s.includes('809')?footerQuery:headerQuery,addEventListener(){}};
 vm.runInNewContext(script,{document,window});
 return {groups,menu,menus,header,desktopLink,document,listenerCounts,footerQuery,headerQuery,init:window.BroadcastwellSiteChrome.init,clickSummary(group){let prevented=false;group.summary.listeners.click({preventDefault(){prevented=true}});if(!prevented)group.open=!group.open;return prevented},resize(w){footerQuery.matches=w<=809;headerQuery.matches=w<=1099;footerQuery.listeners.forEach(fn=>fn());headerQuery.listeners.forEach(fn=>fn())},documentListeners};
}
test('phone footer begins collapsed, desktop is expanded and resizing preserves the phone choice',()=>{
 const ui=simulate(390);
 assert.ok(ui.groups.every(group=>group.open===false));
 ui.clickSummary(ui.groups[1]);assert.equal(ui.groups[1].open,true);
 ui.resize(1440);assert.ok(ui.groups.every(group=>group.open));
 assert.equal(ui.clickSummary(ui.groups[0]),true);assert.equal(ui.groups[0].open,true);
 ui.resize(390);assert.deepEqual(ui.groups.map(group=>group.open),[false,true,false,false,false]);
 assert.equal(ui.groups[0].summary.attrs['aria-disabled'],undefined);
});
test('menu Escape restores focus; outside click and desktop resize dismiss the disclosure',()=>{
 const ui=simulate(390);ui.menu.open=true;
 ui.menu.listeners.toggle();assert.equal(ui.menu.summary.attrs['aria-label'],'Close Broadcastwell navigation');
 ui.menu.listeners.keydown({key:'Escape',preventDefault(){}});
 assert.equal(ui.menu.open,false);assert.equal(ui.menu.summary.focused,true);
 assert.equal(ui.menu.summary.attrs['aria-label'],'Open Broadcastwell navigation');
 ui.menu.open=true;ui.documentListeners.click({target:{}});assert.equal(ui.menu.open,false);
 ui.menu.open=true;ui.resize(1440);assert.equal(ui.menu.open,false);
});
test('initialization preserves existing choices and binds newly inserted groups',()=>{
 const ui=simulate(390);ui.clickSummary(ui.groups[2]);
 ui.init();assert.equal(ui.groups[2].open,true);
 const added=element();added.summary=element();added.querySelector=()=>added.summary;
 ui.groups.push(added);ui.init();assert.equal(added.open,false);
 ui.clickSummary(added);ui.init();assert.equal(added.open,true);
 ui.resize(1440);assert.ok(ui.groups.every(group=>group.open));
 ui.resize(390);assert.equal(ui.groups[2].open,true);assert.equal(added.open,true);
 ui.groups[2].summary.focus();ui.clickSummary(ui.groups[2]);ui.init();assert.equal(ui.groups[2].open,false,'focus on the visible summary does not reopen a closed group');
});
test('resizing retains the focused footer group and moves header focus to a visible control',()=>{
 const ui=simulate(1440);ui.groups[1].link.focus();ui.resize(390);
 assert.equal(ui.groups[1].open,true);assert.equal(ui.document.activeElement,ui.groups[1].link);
 assert.ok(ui.groups.filter((_,i)=>i!==1).every(group=>!group.open));
 ui.menu.open=true;ui.menu.link.focus();ui.resize(1440);
 assert.equal(ui.menu.open,false);assert.equal(ui.document.activeElement,ui.desktopLink);
 ui.resize(390);assert.equal(ui.document.activeElement,ui.menu.summary);
});
test('dynamic replacement keeps only one set of global listeners and leaves detached nodes untouched',()=>{
 const ui=simulate(1440),detachedGroup=ui.groups.shift(),detachedMenu=ui.menus.pop();
 detachedMenu.open=true;ui.init();ui.init();ui.resize(390);ui.documentListeners.click({target:{}});
 assert.equal(detachedGroup.open,true);assert.equal(detachedMenu.open,true);
 assert.equal(ui.footerQuery.listeners.length,1);assert.equal(ui.headerQuery.listeners.length,1);assert.equal(ui.listenerCounts.click,1);
});
