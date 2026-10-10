import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildEmail,buildGmailRaw,deliverEmail,getGmailAccessToken} from '../supabase/functions/send-hashtag-email/mail.mjs';
const job={id:'test-job',email:'candidate@example.invalid',hashtag:'joedistrict5',title:'Roads <script> — sí',excerpt:'Please respond #joedistrict5 & <img src=x onerror=alert(1)>'};
test('Gmail MIME handles unicode, HTML escaping, opt out and single recipient',()=>{
 const mail=buildEmail(job,'ispoylt@gmail.com');
 assert.ok(mail.html.includes('&lt;img')); assert.ok(!mail.html.includes('<script>'));
 assert.ok(mail.text.includes('uncheck email notifications'));
 const mime=Buffer.from(buildGmailRaw(job),'base64url').toString();
 assert.ok(mime.includes('From: SPOYLT <ispoylt@gmail.com>'));
 assert.ok(mime.includes('To: candidate@example.invalid\r\n'));
 assert.ok(mime.includes('Message-ID: <spoylt-hashtag-test-job@spoylt.org>'));
 assert.ok(mime.split('\r\n').every(line=>line.length<998));
 assert.throws(()=>buildGmailRaw({...job,email:'victim@example.com\r\nBcc: other@example.com'}));
});
test('Gmail token refresh validates the authorized sender before sending',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{calls.push([url,options]);return Response.json(url.endsWith('/token')?{access_token:'test-token'}:{email:'ispoylt@gmail.com',email_verified:true});};
 assert.deepEqual(await getGmailAccessToken({clientId:'id',clientSecret:'secret',refreshToken:'refresh'},fetcher),{accessToken:'test-token'});
 assert.ok(calls[0][1].body.includes('grant_type=refresh_token'));
 assert.equal((await getGmailAccessToken({},async url=>Response.json(url.endsWith('/token')?{access_token:'token'}:{email:'wrong@gmail.com',email_verified:true}))).result,'failed');
});
test('sends Gmail raw message and records acceptance ID',async()=>{
 const calls=[]; const mock=async(url,options)=>{calls.push([url,options]);return Response.json({id:'gmail-message'});};
 assert.deepEqual(await deliverEmail(job,'token',mock),{result:'sent',provider_id:'gmail-message'});
 assert.equal(calls[0][0],'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
 assert.equal(calls[0][1].headers.Authorization,'Bearer token');
 assert.ok(JSON.parse(calls[0][1].body).raw);
});
test('only explicit quota rejection retries; uncertain submissions stop',async()=>{
 for(const [status,result] of [[429,'retry'],[503,'failed'],[401,'failed'],[422,'failed']]) {
  assert.equal((await deliverEmail(job,'token',async()=>new Response('',{status}))).result,result);
 }
 assert.equal((await deliverEmail(job,'token',async()=>Response.json({error:{errors:[{reason:'userRateLimitExceeded'}]}},{status:403}))).result,'retry');
 assert.equal((await deliverEmail(job,'token',async()=>{throw new Error('timeout');})).result,'failed');
 assert.equal((await deliverEmail(job,'token',async()=>Response.json({}))).result,'failed');
});
