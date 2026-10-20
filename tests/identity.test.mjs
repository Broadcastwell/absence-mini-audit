import test from 'node:test';
import assert from 'node:assert/strict';
import {matchIdentity,normalizeName,ownEntity} from '../lib/identity.js';
import {seal,verify,sealKey} from '../lib/seal.js';
import {proposeProducts,readPage} from '../lib/analyze.js';
const applied={host:'appliedsystems.com',brand:'Applied Systems',product_names:['Applied Epic']};
const row=(answer,names=[],status='extracted')=>({answer,named_companies:names,names_status:status});
test('confirmed products match entities with suffix and punctuation normalization',()=>{
  assert.equal(normalizeName('Applied Systems, Inc.'),'applied');
  assert.equal(matchIdentity(row('Applied Epic is a product.',['Applied Epic']),applied).named,true);
  assert.equal(ownEntity('Applied Epic',applied),true);
  assert.equal(matchIdentity(row('Applied Epicor is a product.',[]),applied).named,false);
});
test('capital whole names support extraction failure and reject lowercase prose',()=>{
  assert.equal(matchIdentity(row('Applied Epic is a product.',[],'names not extracted'),applied).named,true);
  assert.equal(matchIdentity(row('applied epic is a product.',[],'names not extracted'),applied).named,false);
  assert.equal(matchIdentity(row('XApplied Epic is a product.',[]),applied).named,false);
});
test('common single words need an extracted entity',()=>{
  const meta={host:'foundationsoft.com',brand:'Foundation Software',product_names:['FOUNDATION']};
  assert.equal(matchIdentity(row('Foundation is essential. No vendor is named.',[]),meta).named,false);
  assert.equal(matchIdentity(row('Foundation is essential.',['Foundation'],'names not extracted'),meta).named,false);
  assert.equal(matchIdentity(row('FOUNDATION handles job costing.',['FOUNDATION']),meta).named,true);
  assert.equal(matchIdentity(row('Foundation Software handles job costing.',[]),meta).named,true);
});
test('legacy host rule stays unchanged and unknown companies stay absent',()=>{
  assert.equal(matchIdentity(row('Read appliedsystems.com',[]),applied).named,true);
  assert.equal(matchIdentity(row('HubSpot and Salesforce.',[]),{host:'broadcastwell.com',brand:'Broadcastwell'}).named,false);
  assert.equal(matchIdentity(row('Epic alone is ambiguous.',[]),applied).named,false);
});
test('product proposals use known vendors and product links without an engine',()=>{
  assert.deepEqual(proposeProducts([],'appliedsystems.com'),['Applied Epic','TAM','DORIS','EZLynx','IVANS']);
  const page=readPage('<title>Acme</title><h1>Acme</h1><nav><a href="/products/stellar">Stellar Desk</a></nav>','https://acme.example/');
  assert.ok(proposeProducts([page],'acme.example').includes('Stellar Desk'));
});
test('the result seal protects matched names and keeps older receipts valid',async()=>{
  const key=await sealKey({},true),result={named:1,asked:10,questions:[{named:true,matched_names:['Applied Epic']}],named_instead:[],cited_sources:null};
  const signature=await seal(key,'Applied Systems','insurance','appliedsystems.com',result);
  assert.equal(await verify(key,'Applied Systems','insurance','appliedsystems.com',result,signature),true);
  assert.equal(await verify(key,'Applied Systems','insurance','appliedsystems.com',{...result,questions:[{named:true,matched_names:['A false label']}]},signature),false);
  delete result.questions[0].matched_names;
  const old=await seal(key,'Applied Systems','insurance','appliedsystems.com',result);
  assert.equal(await verify(key,'Applied Systems','insurance','appliedsystems.com',result,old),true);
});
