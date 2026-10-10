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
export async function deliverEmail(job,from,key,fetcher=fetch) {
 const response=await fetcher('https://api.resend.com/emails',{
  method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'spoylt-hashtag-'+job.id},
  body:JSON.stringify(buildEmail(job,from)),signal:AbortSignal.timeout(15000)
 });
 if(!response.ok) return {result:response.status===429 || response.status>=500 ? 'retry':'failed'};
 const data=await response.json();
 return data.id ? {result:'sent',provider_id:data.id} : {result:'retry'};
}
