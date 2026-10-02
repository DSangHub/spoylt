/* Opt-in factual FAQ assistants. Every authorization decision is enforced server-side. */
let assistantRevision = null;
let assistantOwnerId = null;
let assistantLoadVersion = 0;
let assistantQuestionKey = null;
let assistantQuestionFingerprint = null;
const assistantFieldClass = 'w-full bg-slate-950 border border-slate-600 rounded-xl px-3 py-2 text-white';

function assistantNote(id, message) { const el=document.getElementById(id); if(el) el.textContent=message; }
function addAssistantFaq(faq={}) {
  const list=document.getElementById('assistant-faqs');
  if(!list || list.children.length>=20) return;
  const card=document.createElement('div'); card.className='border border-slate-700 rounded-xl p-4 space-y-2';
  card.dataset.faqId=faq.id||crypto.randomUUID();
  for(const [key,label,max] of [['question','FAQ question',300],['answer','Approved factual answer',1500],['source_url','Public source URL (https://)',500]]) {
    const wrapper=document.createElement('label'); wrapper.className='block text-sm text-slate-300'; wrapper.textContent=label;
    const input=document.createElement(key==='answer'?'textarea':'input'); input.className=assistantFieldClass;input.dataset.faqField=key;
    input.maxLength=max; input.required=true; input.value=faq[key]||''; if(key==='source_url')input.type='url';
    if(key==='answer')input.rows=3; wrapper.append(input);card.append(wrapper);
  }
  const remove=document.createElement('button');remove.type='button';remove.textContent='Remove FAQ';remove.className='text-sm text-rose-300';
  remove.addEventListener('click',()=>card.remove());card.append(remove);list.append(card);
}
function collectAssistantFaqs() {
  return Array.from(document.querySelectorAll('#assistant-faqs > div')).map(card=>{
    const faq={id:card.dataset.faqId};card.querySelectorAll('[data-faq-field]').forEach(input=>faq[input.dataset.faqField]=input.value.trim());return faq;
  });
}
async function assistantCall(body) {
  const {data,error}=await db.functions.invoke('official-auto-assistant',{body});
  if(error||data?.error) throw new Error(data?.error||'The assistant request could not complete. Please refresh or try again.');return data;
}
function assistantRenderQuestions(target, rows, owner=false) {
  const list=document.getElementById(target); if(!list)return;list.replaceChildren();
  if(!rows.length) {list.textContent=owner?'No questions yet.':'No questions sent yet.';return;}
  rows.forEach(q=>{
    const card=document.createElement('article');card.className='border border-slate-700 rounded-xl p-4 space-y-2';
    const question=document.createElement('p');question.textContent=q.question;card.append(question);
    const status=document.createElement('p');status.className='text-xs text-slate-400';status.textContent=q.status.replaceAll('_',' ')+' · '+new Date(q.created_at).toLocaleString();card.append(status);
    if(q.answer){const label=document.createElement('p');label.className='text-xs text-sky-300';label.textContent=q.answer_label;card.append(label);
      const answer=document.createElement('p');answer.className='text-sm whitespace-pre-wrap';answer.textContent=q.answer;card.append(answer);
      if(q.source_url){try{const url=new URL(q.source_url);if(url.protocol==='https:'){const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.className='text-xs text-sky-400 underline';a.textContent='Approved source';card.append(a);}}catch{}}
    }else if(q.status==='needs_review'||q.status==='error'){const note=document.createElement('p');note.className='text-sm text-amber-300';note.textContent='Waiting for the account owner to review.';card.append(note);}
    const stale=q.status==='processing' && Date.now()-new Date(q.created_at).getTime()>300000;
    if(owner&&(['needs_review','error'].includes(q.status)||stale)) {
      const form=document.createElement('form');const input=document.createElement('textarea');input.className=assistantFieldClass;input.maxLength=2000;input.required=true;input.placeholder='Write your own reply';input.setAttribute('aria-label','Your reply to this question');
      const button=document.createElement('button');button.className='mt-2 bg-sky-500 rounded-lg px-4 py-2';button.textContent='Send my reply';
      const feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.className='text-xs text-slate-400';form.append(input,button,feedback);card.append(form);
      form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;try{const result=await assistantCall({action:'human_reply',question_id:q.id,answer:input.value});feedback.textContent=result.message;await loadAssistantQuestions();}catch(error){feedback.textContent=error.message;}finally{button.disabled=false;}});
    }
    list.append(card);
  });
}
async function loadAssistantQuestions() {
  const userId=currentUser?.id;
  document.getElementById('assistant-history')?.replaceChildren();document.getElementById('assistant-inbox')?.replaceChildren();
  if(!userId)return;
  const results=await Promise.all([
    db.from('official_assistant_questions').select('id,question,status,answer,answer_label,source_url,created_at').eq('visitor_id',userId).order('created_at',{ascending:false}).limit(30),
    db.from('official_assistant_questions').select('id,question,status,answer,answer_label,source_url,created_at').eq('owner_id',userId).order('created_at',{ascending:false}).limit(50),
  ]);
  if(currentUser?.id!==userId)return;
  if(!results[0].error)assistantRenderQuestions('assistant-history',results[0].data);
  if(!results[1].error)assistantRenderQuestions('assistant-inbox',results[1].data,true);
}
async function loadAssistantDirectory() {
  const select=document.getElementById('assistant-person');if(!select)return;
  const selected=select.value;select.replaceChildren(new Option('Choose an enabled assistant',''));
  if(!currentUser){assistantNote('assistant-ask-status','Sign in to choose an enabled assistant.');return;}
  const directoryUser=currentUser.id;
  let data;
  try {const result=await assistantCall({action:'directory'}); data=result.assistants;} catch {assistantNote('assistant-ask-status','The assistant directory is unavailable.');return;}
  if(currentUser?.id!==directoryUser)return;
  (data||[]).forEach(p=>select.add(new Option([p.display_name,p.office_title,p.district,p.jurisdiction].filter(Boolean).join(' · '),p.owner_id)));
  if((data||[]).some(p=>p.owner_id===selected))select.value=selected;
  assistantNote('assistant-ask-status',data?.length?'':'No verified accounts have enabled automatic replies yet.');
}
async function refreshOfficialAssistant() {
  const version=++assistantLoadVersion, userId=currentUser?.id;
  const verified=Boolean(userId&&currentPlan==='premium'&&verificationRequest?.status==='verified'&&verificationRequest?.identity_status==='verified'&&['official','candidate'].includes(verificationRequest.verification_type)&&new Date(verificationRequest.expires_at)>new Date());
  document.getElementById('assistant-owner-tools')?.classList.toggle('hidden',!verified);
  if(assistantOwnerId!==userId){assistantRevision=null;assistantOwnerId=userId;document.getElementById('assistant-faqs')?.replaceChildren();document.getElementById('assistant-consent').checked=false;}
  await loadAssistantQuestions();
  await loadAssistantDirectory();
  if(!verified)return;
  const {data,error}=await db.from('official_assistants').select('revision,enabled,faqs').eq('owner_id',userId).maybeSingle();
  if(version!==assistantLoadVersion||currentUser?.id!==userId)return;
  if(error){assistantNote('assistant-config-status','Could not load assistant settings.');return;}
  assistantRevision=data?.revision||null;
  document.getElementById('assistant-enabled').checked=Boolean(data?.enabled);
  const list=document.getElementById('assistant-faqs');list.replaceChildren();
  if(data?.faqs?.length)data.faqs.forEach(addAssistantFaq);else addAssistantFaq();
  assistantNote('assistant-config-status',data?.enabled?'Automatic replies are enabled.':'Automatic replies are paused.');
}
function setupOfficialAssistant() {
  document.getElementById('assistant-add-faq')?.addEventListener('click',()=>addAssistantFaq());
  document.getElementById('assistant-pause')?.addEventListener('click',async()=>{
    try{const r=await assistantCall({action:'pause'});assistantNote('assistant-config-status',r.message);await refreshOfficialAssistant();await loadAssistantDirectory();}catch(error){assistantNote('assistant-config-status',error.message);}
  });
  document.getElementById('assistant-settings')?.addEventListener('submit',async e=>{
    e.preventDefault();const button=document.getElementById('assistant-save');button.disabled=true;assistantNote('assistant-config-status','Checking approved FAQs…');
    try{const r=await assistantCall({action:'configure',enabled:document.getElementById('assistant-enabled').checked,consent:document.getElementById('assistant-consent').checked,faqs:collectAssistantFaqs(),revision:assistantRevision});assistantRevision=r.revision;assistantNote('assistant-config-status',r.message);await loadAssistantDirectory();}catch(error){assistantNote('assistant-config-status',error.message);}finally{button.disabled=false;}
  });
  document.getElementById('assistant-ask-form')?.addEventListener('submit',async e=>{
    e.preventDefault();if(!await requireUser())return;
    const askingUser=currentUser.id;
    const owner_id=document.getElementById('assistant-person').value,question=document.getElementById('assistant-question').value.trim();
    const fingerprint=JSON.stringify([currentUser.id,owner_id,question]);
    if(fingerprint!==assistantQuestionFingerprint){assistantQuestionKey=crypto.randomUUID();assistantQuestionFingerprint=fingerprint;}
    const button=document.getElementById('assistant-send');button.disabled=true;assistantNote('assistant-ask-status','Checking your question…');
    try{const r=await assistantCall({action:'ask',owner_id,question,request_key:assistantQuestionKey,consent:document.getElementById('assistant-visitor-consent').checked});if(currentUser?.id!==askingUser)return;assistantNote('assistant-ask-status',[r.label,r.answer,r.message].filter(Boolean).join('\n'));if(r.status!=='processing'){assistantQuestionKey=null;assistantQuestionFingerprint=null;}await loadAssistantQuestions();}catch(error){assistantNote('assistant-ask-status',error.message);}finally{button.disabled=false;}
  });
  document.getElementById('assistant-refresh')?.addEventListener('click',async()=>{await loadAssistantDirectory();await loadAssistantQuestions();});
  loadAssistantDirectory();
}
