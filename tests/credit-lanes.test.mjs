import test from 'node:test';
import assert from 'node:assert/strict';
import {creditDecision,measureQuestions,scoreAnswers,ledgerLane} from '../lib/engine-core.js';
import {weeklySummary} from '../lib/health-core.js';
const cfg={enabled:true,daily_stop_usd:15,lane_stop_usd:150,daily_alert_usd:10,lane_alert_usd:100,build_test_active:false};
test('real build and editor spend never close the public lane',()=>{const rows=[{date:'2026-10-20',lane:'build',cost:12},{date:'2026-10-20',lane:'editor',cost:3},{date:'2026-10-20',lane:'public',cost:1},{date:'2026-10-20',lane:'health',cost:.25}];const d=creditDecision(rows,cfg,new Date('2026-10-20'));assert.equal(d.allowed,true);assert.equal(d.daily,1.25);assert.equal(d.lane,1.25);assert.equal(d.alert,false);});
test('public and health reservations still close the lane and pending spend stays fail closed',()=>{assert.equal(creditDecision([{date:'2026-10-20',lane:'health',outcome:'reserved',reserved_cost:15}],cfg,new Date('2026-10-20')).allowed,false);assert.equal(creditDecision([{lane:'editor',usage_pending:'true'}],cfg).allowed,false);});
test('weekly counts exclude health and keep each lane cost visible',()=>{
  const rows=['public','health','build','editor'].map(lane=>({lane,cost:1,outcome:'complete',created_utc:'2026-10-20T12:00:00Z',milliseconds:1000}));
  const s=weeklySummary(rows,cfg,'2026-10-19T00:00:00Z','2026-10-26T00:00:00Z');assert.equal(s.checks_served,1);assert.equal(s.credit_spend_week,4);for(const v of Object.values(s.lanes))assert.equal(v.cost,1);
});
test('Index request defaults send a verbatim question with no extra sampling or thinking settings',async()=>{
  const requests=[];const configuration={enabled:true,model:'claude-sonnet-4-6',prices_per_million:{'claude-sonnet-4-6':{input:3,output:15}},web_search_usd_each:.01,max_tokens:2000,index_request_defaults:true,web_search_type:'web_search_20250305',max_uses:3,question_timeout_ms:45000,attempts:3,concurrency:5};
  const questions=Array.from({length:10},(_,i)=>'Verbatim question '+i);
  const result=await measureQuestions({questions,meta:{host:'example.com',brand:'Example'},config:configuration,extract:false,sleep:async()=>{},request:async body=>{requests.push(body);return {statusCode:200,body:{model:'claude-sonnet-4-6',stop_reason:'end_turn',content:[{type:'text',text:'Peer Vendor.'}],usage:{input_tokens:1,output_tokens:1}}};}});
  assert.equal(result.ok,true);assert.equal(requests.length,10);
  requests.forEach((request,index)=>{assert.deepEqual(Object.keys(request).sort(),['max_tokens','messages','model','tools']);assert.equal(request.messages[0].content,questions[index]);assert.equal(request.max_tokens,2000);assert.deepEqual(request.tools,[{type:'web_search_20250305',name:'web_search',max_uses:3}]);});
});
test('rescoring removes confirmed company and product entities from competing names',()=>{
  const rows=Array.from({length:10},()=>({question:'Which software?',answer:'Applied Epic and HawkSoft.',named:false,named_companies:['Applied Epic','HawkSoft'],names_status:'extracted',sources:['peer.example']}));
  const result=scoreAnswers(rows,{host:'appliedsystems.com',brand:'Applied Systems',product_names:['Applied Epic']},'2026-10-20');
  assert.equal(result.named,10);assert.deepEqual(result.named_instead,[{company:'HawkSoft',count:10}]);assert.deepEqual(result.questions[0].matched_names,['Applied Epic']);
});
test('a recorded proof id backfills its real cost without relabeling visitors',()=>{
  const configuration={...cfg,build_execution_ids:['proof']};
  assert.equal(ledgerLane({execution_id:'proof',lane:'public'},configuration),'build');
  assert.equal(ledgerLane({execution_id:'visitor',lane:'public'},configuration),'public');
  const d=creditDecision([{execution_id:'proof',lane:'public',date:'2026-10-20',cost:12},{execution_id:'visitor',lane:'public',date:'2026-10-20',cost:1}],configuration,new Date('2026-10-20'));
  assert.equal(d.daily,1);assert.equal(d.allowed,true);
});
