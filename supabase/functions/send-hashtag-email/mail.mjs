export function escapeHtml(value) {
 return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function buildEmail(job,from) {
 const subject='SPOYLT: #'+job.hashtag+' was mentioned';
 const link='https://www.spoylt.org/#issues';
 const text='Your hashtag #'+job.hashtag+' was mentioned on SPOYLT.\n\n'+job.title+'\n\n'+job.excerpt+
  '\n\nRead and respond: '+link+'\n\nYou received this because you opted in to hashtag emails. To stop, sign in and uncheck email notifications under Your campaign hashtag, then save.';
 const html='<p>Your hashtag <strong>#'+escapeHtml(job.hashtag)+'</strong> was mentioned on SPOYLT.</p><h2>'+
  escapeHtml(job.title)+'</h2><blockquote style="white-space:pre-wrap">'+escapeHtml(job.excerpt)+
  '</blockquote><p><a href="'+link+'">Read and respond on SPOYLT</a></p><p>You received this because you opted in to hashtag emails. To stop, sign in and uncheck email notifications under Your campaign hashtag, then save.</p>';
 return {from,to:[job.email],reply_to:'ispoylt@gmail.com',subject,text,html};
}
// Gmail sender is fixed to the account the owner authorized.
export const GMAIL_SENDER='ispoylt@gmail.com';
const encode=value=>btoa(String.fromCharCode(...new TextEncoder().encode(value)));
const body64=value=>encode(value).match(/.{1,76}/g)?.join('\r\n')||'';
const address=value=>{if(!/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(value)) throw new Error('Invalid address'); return value;};
export function buildGmailRaw(job) {
 const mail=buildEmail(job,GMAIL_SENDER);
 const boundary='spoylt_'+String(job.id).replace(/[^a-zA-Z0-9]/g,'');
 const mime=[
  'From: SPOYLT <'+GMAIL_SENDER+'>','To: '+address(job.email),'Reply-To: '+GMAIL_SENDER,
  'Subject: =?UTF-8?B?'+encode(mail.subject)+'?=',
  'Message-ID: <spoylt-hashtag-'+String(job.id).replace(/[^a-zA-Z0-9-]/g,'')+'@spoylt.org>',
  'Date: '+new Date().toUTCString(),'MIME-Version: 1.0','Content-Type: multipart/alternative; boundary="'+boundary+'"','',
  '--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',body64(mail.text),
  '--'+boundary,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',body64(mail.html),
  '--'+boundary+'--',''
 ].join('\r\n');
 return encode(mime).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function getGmailAccessToken(credentials,fetcher=fetch) {
 try {
  const response=await fetcher('https://oauth2.googleapis.com/token',{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({client_id:credentials.clientId,client_secret:credentials.clientSecret,refresh_token:credentials.refreshToken,grant_type:'refresh_token'}).toString(),
   signal:AbortSignal.timeout(10000)
  });
  if(!response.ok) return {result:response.status===429||response.status>=500?'retry':'failed'};
  const data=await response.json();
  if(!data.access_token) return {result:'failed'};
  const identity=await fetcher('https://openidconnect.googleapis.com/v1/userinfo',{
   headers:{Authorization:'Bearer '+data.access_token},signal:AbortSignal.timeout(10000)
  });
  if(!identity.ok) return {result:identity.status===429||identity.status>=500?'retry':'failed'};
  const user=await identity.json();
  if(user.email?.toLowerCase()!==GMAIL_SENDER || !user.email_verified) return {result:'failed'};
  return {accessToken:data.access_token};
 } catch {return {result:'retry'};} // No message was submitted yet.
}
export async function deliverEmail(job,accessToken,fetcher=fetch) {
 let raw;
 try {raw=buildGmailRaw(job);} catch {return {result:'failed'};}
 try {
  const response=await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
   method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
   body:JSON.stringify({raw}),signal:AbortSignal.timeout(10000)
  });
  if(!response.ok) {
   let data; try {data=await response.json();} catch {data={};}
   const reasons=data.error?.errors?.map(e=>e.reason)||[];
   // Only explicit quota rejection is known not to have sent the message.
   if(response.status===429 || (response.status===403 && reasons.some(r=>['rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded'].includes(r)))) return {result:'retry'};
   return {result:'failed'};
  }
  const data=await response.json();
  return data.id ? {result:'sent',provider_id:data.id} : {result:'failed'};
 } catch {return {result:'failed'};} // Ambiguous outcome: hold for manual review, never blind retry.
}
