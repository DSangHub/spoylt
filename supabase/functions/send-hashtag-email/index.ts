import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { deliverEmail, getGmailAccessToken, GMAIL_SENDER } from './mail.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async req=>{
 const credentials={clientId:Deno.env.get('GMAIL_CLIENT_ID'),clientSecret:Deno.env.get('GMAIL_CLIENT_SECRET'),refreshToken:Deno.env.get('GMAIL_REFRESH_TOKEN')};
 const sender=GMAIL_SENDER;
 const configured=Boolean(credentials.clientId && credentials.clientSecret && credentials.refreshToken);
 if(req.method==='GET') return Response.json({provider:'gmail',email_configured:configured,sender});
 if(req.method!=='POST') return new Response('Method not allowed',{status:405});
 let body;
 try {body=await req.json();} catch {return new Response('Invalid request',{status:400});}
 if(!uuid.test(body?.job_id||'')||!uuid.test(body?.token||'')) return new Response('Invalid request',{status:400});
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {data:job,error}=await admin.rpc('claim_hashtag_email',{p_id:body.job_id,p_token:body.token,p_configured:configured,p_sender:sender||''});
 if(error) return new Response('Queue unavailable',{status:503});
 if(!job) return new Response('Unauthorized',{status:401});
 if(job.status!=='send') return Response.json({status:job.status});
 let result;
 const auth=await getGmailAccessToken(credentials);
 if(!auth.accessToken) result={result:auth.result||'failed'};
 else {
  const {data:allowed,error:gateError}=await admin.rpc('begin_hashtag_gmail_submission',{p_id:job.id,p_lease:job.lease});
  if(gateError) return new Response('Queue unavailable',{status:503});
  if(!allowed) result={result:'retry'};
  else result=await deliverEmail(job,auth.accessToken);
 }
 const finished=await admin.rpc('finish_hashtag_email',{p_id:job.id,p_lease:job.lease,p_result:result.result,p_provider_id:result.provider_id||null});
 if(finished.error) return new Response('Queue update unavailable',{status:503});
 return Response.json({status:result.result});
});
