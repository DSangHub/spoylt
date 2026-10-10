import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildEmail,deliverEmail} from '../supabase/functions/send-hashtag-email/mail.mjs';
const job={id:'test-job',email:'candidate@example.invalid',hashtag:'joedistrict5',title:'Roads <script>',excerpt:'Please respond #joedistrict5 & <img src=x onerror=alert(1)>'};
test('message escapes user text and includes consent withdrawal instructions',()=>{
 const mail=buildEmail(job,'alerts@spoylt.org');
 assert.deepEqual(mail.to,['candidate@example.invalid']);
 assert.ok(mail.html.includes('&lt;img'));
 assert.ok(!mail.html.includes('<script>'));
 assert.ok(mail.text.includes('uncheck email notifications'));
 assert.equal(mail.reply_to,'ispoylt@gmail.com');
});
test('retry reuses exact provider payload and idempotency key',async()=>{
 const calls=[];
 const mock=async(url,options)=>{calls.push([url,options]);return new Response(JSON.stringify({id:'provider-test'}),{status:200});};
 assert.deepEqual(await deliverEmail(job,'alerts@spoylt.org','test-key',mock),{result:'sent',provider_id:'provider-test'});
 await deliverEmail(job,'alerts@spoylt.org','test-key',mock);
 assert.equal(calls[0][1].body,calls[1][1].body);
 assert.equal(calls[0][1].headers['Idempotency-Key'],'spoylt-hashtag-test-job');
});
test('transient errors retry; permanent rejection stops sending',async()=>{
 for(const [status,result] of [[429,'retry'],[503,'retry'],[401,'failed'],[422,'failed']]) {
  assert.equal((await deliverEmail(job,'alerts@spoylt.org','test-key',async()=>new Response('',{status}))).result,result);
 }
});
