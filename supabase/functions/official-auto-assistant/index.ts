import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {UUID,validateFaqs,approveFaqs,selectAnswer,cleanText,HANDOFF} from './policy.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json'}});
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if(!token) return json({error:'Sign in required'},401);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authError}=await admin.auth.getUser(token);
  if(authError||!auth.user) return json({error:'Invalid session'},401);
  let body:any;try{body=await req.json();}catch{return json({error:'Invalid request'},400);}
  const userId=auth.user.id;
  const key=Deno.env.get('OPENAI_API_KEY');
  const rpc=async(name:string,args:any)=>{
    const {data,error}=await admin.rpc(name,args); if(error) throw new Error(error.message);
    return name==='finish_official_question' && Array.isArray(data) ? data[0] : data;
  };
  try {
    if(body.action==='directory') return json({assistants:await rpc('list_official_assistants',{})});
    if(body.action==='pause') {await rpc('pause_official_assistant',{p_owner:userId});return json({message:'Automatic replies paused.'});}
    if(body.action==='configure') {
      if(body.consent!==true||typeof body.enabled!=='boolean') return json({error:'Explicit account-owner authorization is required'},400);
      const faqs=validateFaqs(body.faqs);
      if(body.enabled&&!faqs.length) return json({error:'Add an approved FAQ before enabling'},400);
      if(body.revision!==null && !UUID.test(body.revision||'')) return json({error:'Reload settings before saving'},400);
      await rpc('check_official_assistant_owner',{p_owner:userId});
      // Reuse the server quota to limit configuration and manual reply API spend.
      if(!await rpc('consume_ai_moderator_quota',{p_user_id:userId,p_action:'moderate'})) return json({error:'Usage limit reached'},429);
      await approveFaqs(faqs,key);
      const revision=await rpc('save_official_assistant',{p_owner:userId,p_enabled:body.enabled,p_faqs:faqs,p_revision:body.revision});
      return json({revision,message:body.enabled?'Automatic FAQ replies enabled.':'FAQs saved; assistant paused.'});
    }
    if(body.action==='human_reply') {
      if(!UUID.test(body.question_id||'')||typeof body.answer!=='string'||!body.answer.trim()||body.answer.length>2000) return json({error:'Valid question and reply required'},400);
      await rpc('check_official_assistant_owner',{p_owner:userId});
      const {data:q}=await admin.from('official_assistant_questions').select('id').eq('id',body.question_id).eq('owner_id',userId).in('status',['needs_review','error']).maybeSingle();
      if(!q) return json({error:'Question unavailable for reply'},404);
      if(!await rpc('consume_ai_moderator_quota',{p_user_id:userId,p_action:'moderate'})) return json({error:'Usage limit reached'},429);
      if(!await cleanText(body.answer.trim(),key)) return json({error:'Reply was flagged; revise before sending'},400);
      await rpc('reply_official_question',{p_id:body.question_id,p_owner:userId,p_answer:body.answer.trim()});
      return json({message:'Your reply is available to the person who asked.'});
    }
    if(body.action!=='ask'||!UUID.test(body.owner_id||'')||!UUID.test(body.request_key||'')||typeof body.question!=='string'||!body.question.trim()||body.question.length>2000||body.consent!==true) return json({error:'Choose an assistant, enter a question and accept the AI notice'},400);
    if(!key) return json({error:'AI service unavailable; no automatic answer was sent'},503);
    const claim=await rpc('claim_official_question',{p_owner:body.owner_id,p_visitor:userId,p_key:body.request_key,p_question:body.question.trim()});
    const q=claim.question;
    const visible=(r:any)=>({id:r.id,status:r.status,answer:r.answer,label:r.answer_label,source_url:r.source_url,message:r.status==='answered'||r.status==='human_answered'?'':r.status==='blocked'?'This question was flagged. Please revise it.':r.status==='processing'?'Question is still processing. Refresh your history shortly.':HANDOFF});
    if(!claim.claimed) return json(visible(q));
    try {
      const {data:config,error:configError}=await admin.from('official_assistants').select('faqs,revision').eq('owner_id',q.owner_id).single();
      if(configError||config.revision!==q.config_revision) throw new Error('Settings changed');
      const result=await selectAnswer(q.question,config.faqs,key);
      const saved=await rpc('finish_official_question',{p_id:q.id,p_status:result.status,p_faq_id:result.faq_id});
      return json(visible(saved));
    }catch{
      const saved=await rpc('finish_official_question',{p_id:q.id,p_status:'error',p_faq_id:null});
      return json(visible(saved));
    }
  }catch(error){
    // Never log prompts, identities, questions, answers, keys or provider response bodies.
    const message=error instanceof Error?error.message:'';
    const known=['Settings changed','Current verified','Assistant paused','Question limit','Request key','FAQ','Only neutral','Use a public','Duplicate'];
    return json({error:known.some(x=>message.startsWith(x))?message:'The request could not complete. No automatic reply was published.'},400);
  }
});
