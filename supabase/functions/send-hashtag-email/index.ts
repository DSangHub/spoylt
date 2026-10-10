import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { deliverEmail } from './mail.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async req=>{
 const key=Deno.env.get('RESEND_API_KEY');
 const sender=Deno.env.get('HASHTAG_EMAIL_FROM');
 const configured=Boolean(key && sender && /^[^<>\s]+@[^<>\s]+\.[^<>\s]+$/.test(sender));
 if(req.method==='GET') return Response.json({email_configured:configured});
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
 try {result=await deliverEmail(job,sender!,key!);} catch {result={result:'retry'};}
 const finished=await admin.rpc('finish_hashtag_email',{p_id:job.id,p_lease:job.lease,p_result:result.result,p_provider_id:result.provider_id||null});
 if(finished.error) return new Response('Queue update unavailable',{status:503});
 return Response.json({status:result.result});
});
