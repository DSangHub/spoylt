import test from 'node:test';
import assert from 'node:assert/strict';
import { screenRecording, validVerification, profanityHits, MAX_VIDEO_BYTES } from '../supabase/functions/moderate-candidate-video/screen.mjs';

const video = {owner_id:'owner',title:'Campaign update',paid_for_by:'Smith Committee',committee_id:'C123',election_date:'2099-11-03'};
const verified = {user_id:'owner',status:'verified',identity_status:'verified',verification_type:'candidate',legal_name:'Joe Smith',
  authoritative_source_url:'https://example.invalid/filing',filing_id:'C123',election_date:'2099-11-03'};
function provider({text='My name is Joe Smith. Please share your local concerns.',flagged=false,foul=false,impersonation=false,broken=false}={}) {
  const calls=[];
  return {calls, fetch:async (url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/audio/transcriptions')) {
      assert.ok(options.body.get('file') instanceof Blob);
      assert.equal(options.body.get('file').name,'candidate.mp4');
      return Response.json({text});
    }
    if(url.endsWith('/moderations')) return Response.json({results:broken?[]:[{flagged,categories:{harassment:flagged}}]});
    if(url.endsWith('/responses')) return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({foul_language:foul,identity_claim_conflict:impersonation,reason:'Test assessment'})}]}]});
    throw Error('Unexpected provider');
  }};
}
const file=new Blob(['test recording bytes'],{type:'video/mp4'});
const screen=(p)=>screenRecording(file,verified,video,{apiKey:'test-only',fetch:p.fetch});
test('verified owner and filing required; expired, revoked, and mismatched records fail',()=>{
  assert.equal(validVerification(verified,video),true);
  for(const delta of [{user_id:'other'},{status:'revoked'},{identity_status:'pending'},{filing_id:'OTHER'},
    {expires_at:'2000-01-01T00:00:00Z'},{election_date:'2000-01-01'},{authoritative_source_url:''}]) {
    assert.equal(validVerification({...verified,...delta},video),false);
  }
});
test('clean transcript passes screening but coverage requires human identity/visual review',async()=>{
  const p=provider();const result=await screen(p);
  assert.equal(result.status,'passed');assert.match(result.findings.coverage,/human/);assert.equal(p.calls.length,3);
});
test('profanity is flagged even when harmful-content model does not flag it',async()=>{
  assert.ok(profanityHits('f@ck this sh1t').length);
  const result=await screen(provider({text:'This is fucking bullshit.'}));
  assert.equal(result.status,'flagged');assert.equal(result.profanity,true);
});
test('multilingual foul-language assessment holds publication',async()=>{
  assert.equal((await screen(provider({foul:true}))).status,'flagged');
});
test('conflicting identity claims hold publication without claiming biometric detection',async()=>{
  const result=await screen(provider({impersonation:true}));
  assert.equal(result.status,'flagged');assert.equal(result.suspected_impersonation,true);
});
test('harmful-content flags hold publication',async()=>{
  assert.equal((await screen(provider({flagged:true}))).status,'flagged');
});
test('empty transcript, malformed provider output, and provider outage fail closed',async()=>{
  await assert.rejects(screen(provider({text:''})));
  await assert.rejects(screen(provider({broken:true})));
  await assert.rejects(screenRecording(file,verified,video,{apiKey:'test',fetch:async()=>new Response('',{status:503})}));
});
test('missing key and oversize recording make no provider call',async()=>{
  let called=false;
  await assert.rejects(screenRecording(file,verified,video,{fetch:async()=>{called=true;}}));
  await assert.rejects(screenRecording({size:MAX_VIDEO_BYTES+1},verified,video,{apiKey:'test',fetch:async()=>{called=true;}}));
  assert.equal(called,false);
});
