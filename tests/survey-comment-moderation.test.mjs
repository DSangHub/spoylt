import test from 'node:test';
import assert from 'node:assert/strict';
import { allowComment } from '../supabase/functions/moderate-survey-comment/policy.mjs';
const moderation = flagged => ({ results: [{ flagged }] });
const decision = value => ({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
function api(...answers) { let calls=0; return {get calls(){return calls;},fetch:async()=> {const value=answers[calls++];if(value instanceof Error)throw value;return {ok:true,json:async()=>value};}}; }
test('civil opinion requires both moderation passes and sends only comment text',async()=>{
 const a=api(moderation(false),decision({allowed:true}));
 assert.equal(await allowComment('I support better roads and would like to hear each candidate’s plan.','test',a.fetch),true); assert.equal(a.calls,2);
});
test('profanity is rejected without a provider request',async()=>{
 const a=api();assert.equal(await allowComment('This is bullshit.','test',a.fetch),false);assert.equal(a.calls,0);
});
test('flagged unsafe content never advances to policy approval',async()=>{
 const a=api(moderation(true));assert.equal(await allowComment('unsafe fixture','test',a.fetch),false);assert.equal(a.calls,1);
});
test('strict policy can reject abuse omitted by moderation endpoint',async()=>{
 const a=api(moderation(false),decision({allowed:false}));assert.equal(await allowComment('policy fixture','test',a.fetch),false);
});
test('unavailable, malformed, missing configuration and incomplete decisions fail closed',async()=>{
 for(const answers of [[new Error('offline')],[{}],[moderation(false),decision({allowed:'true'})],[moderation(false),{status:'incomplete'}]]){
  const a=api(...answers);await assert.rejects(allowComment('civil fixture','test',a.fetch));
 }
 await assert.rejects(allowComment('civil fixture',undefined,api().fetch));
});
test('model refusal cannot approve a comment',async()=>{
 const a=api(moderation(false),{status:'completed',output:[{content:[{type:'refusal'}]}]});assert.equal(await allowComment('fixture','test',a.fetch),false);
});
