-- Opt-in factual FAQ assistants; existing proposition/comment posting is unchanged.
begin;
grant usage on schema private to service_role;
create table public.official_assistants (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  faqs jsonb not null default '[]'::jsonb check (jsonb_typeof(faqs)='array' and jsonb_array_length(faqs)<=20),
  consent_at timestamptz,
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  check (not enabled or (consent_at is not null and jsonb_array_length(faqs)>0))
);
create table public.official_assistant_questions (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null,
  owner_id uuid not null references public.official_assistants(owner_id) on delete cascade,
  visitor_id uuid not null references auth.users(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 2000),
  status text not null default 'processing' check (status in ('processing','answered','needs_review','blocked','error','human_answered')),
  answer text,
  answer_label text,
  source_url text,
  faq_id text,
  config_revision uuid not null,
  verification_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  unique(visitor_id,request_key)
);
create index official_assistant_owner_inbox on public.official_assistant_questions(owner_id,created_at desc);
create index official_assistant_visitor_usage on public.official_assistant_questions(visitor_id,created_at desc);
alter table public.official_assistants enable row level security;
alter table public.official_assistant_questions enable row level security;
revoke all on public.official_assistants, public.official_assistant_questions from anon,authenticated;
grant select on public.official_assistants,public.official_assistant_questions to authenticated;
grant all on public.official_assistants,public.official_assistant_questions to service_role;
create policy assistant_owner_read on public.official_assistants for select to authenticated using ((select auth.uid())=owner_id);
create policy assistant_participant_read on public.official_assistant_questions for select to authenticated using ((select auth.uid())=owner_id or (select auth.uid())=visitor_id);

create or replace function private.official_assistant_eligible(p_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.verification_requests v join public.memberships m on m.user_id=v.user_id
    where v.user_id=p_owner and v.status='verified' and v.identity_status='verified'
    and v.verification_type in ('official','candidate') and v.expires_at>now()
    and (v.election_date is null or v.election_date>=current_date)
    and (v.term_end is null or v.term_end>=current_date)
    and m.plan='premium' and m.status in ('active','trialing')
    and (m.current_period_end is null or m.current_period_end>now()));
$$;
revoke all on function private.official_assistant_eligible(uuid) from public,anon,authenticated;
grant execute on function private.official_assistant_eligible(uuid) to service_role;

-- Service-only directory returns opt-in eligible identities through the authenticated Edge Function.
create or replace function public.list_official_assistants()
returns table(owner_id uuid,display_name text,office_title text,jurisdiction text,district text)
language sql stable security invoker set search_path='' as $$
 select a.owner_id,v.legal_name,v.office_title,v.jurisdiction,v.district
 from public.official_assistants a join public.verification_requests v on v.user_id=a.owner_id
 where a.enabled and private.official_assistant_eligible(a.owner_id)
 order by v.legal_name limit 200;
$$;
revoke all on function public.list_official_assistants() from public,anon,authenticated;
grant execute on function public.list_official_assistants() to service_role;

create or replace function public.check_official_assistant_owner(p_owner uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not private.official_assistant_eligible(p_owner) then raise exception 'Current verified Premium account required'; end if;
 return true;
end; $$;
revoke all on function public.check_official_assistant_owner(uuid) from public,anon,authenticated;
grant execute on function public.check_official_assistant_owner(uuid) to service_role;

-- Called only by the authenticated Edge Function after input validation and opt-in consent.
create or replace function public.save_official_assistant(p_owner uuid,p_enabled boolean,p_faqs jsonb,p_revision uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.official_assistants; r uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,41));
 select * into a from public.official_assistants where owner_id=p_owner for update;
 if a.owner_id is not null and a.revision is distinct from p_revision then raise exception 'Settings changed; reload before saving'; end if;
 if not private.official_assistant_eligible(p_owner) then raise exception 'Current verified Premium account required'; end if;
 insert into public.official_assistants(owner_id,enabled,faqs,consent_at,revision)
 values(p_owner,p_enabled,p_faqs,now(),r)
 on conflict(owner_id) do update set enabled=excluded.enabled,faqs=excluded.faqs,consent_at=excluded.consent_at,revision=r,updated_at=now();
 return r;
end; $$;
create or replace function public.pause_official_assistant(p_owner uuid)
returns void language sql security invoker set search_path='' as $$
 update public.official_assistants set enabled=false,revision=gen_random_uuid(),updated_at=now() where owner_id=p_owner;
$$;

create or replace function public.claim_official_question(p_owner uuid,p_visitor uuid,p_key uuid,p_question text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.official_assistants; q public.official_assistant_questions; hourly integer; daily integer; owner_daily integer; verified_at timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_visitor::text,42));
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,43));
 select * into q from public.official_assistant_questions where visitor_id=p_visitor and request_key=p_key;
 if q.id is not null then
   if q.owner_id<>p_owner or q.question<>p_question then raise exception 'Request key already used'; end if;
   return jsonb_build_object('claimed',false,'question',to_jsonb(q));
 end if;
 select * into a from public.official_assistants where owner_id=p_owner for share;
 if not coalesce(a.enabled,false) or not private.official_assistant_eligible(p_owner) then raise exception 'Assistant paused or unavailable'; end if;
 select count(*) filter(where created_at>now()-interval '1 hour'),count(*) into hourly,daily
 from public.official_assistant_questions where visitor_id=p_visitor and created_at>now()-interval '1 day';
 select count(*) into owner_daily from public.official_assistant_questions where owner_id=p_owner and created_at>now()-interval '1 day';
 if hourly>=5 or daily>=20 or owner_daily>=100 then raise exception 'Question limit reached'; end if;
 select updated_at into verified_at from public.verification_requests where user_id=p_owner;
 insert into public.official_assistant_questions(request_key,owner_id,visitor_id,question,config_revision,verification_updated_at)
 values(p_key,p_owner,p_visitor,p_question,a.revision,verified_at) returning * into q;
 return jsonb_build_object('claimed',true,'question',to_jsonb(q));
end; $$;

-- Rechecks opt-in, subscription, verification and FAQ revision inside the publication transaction.
create or replace function public.finish_official_question(p_id uuid,p_status text,p_faq_id text default null)
returns public.official_assistant_questions language plpgsql security invoker set search_path='' as $$
declare q public.official_assistant_questions; a public.official_assistants; v public.verification_requests; faq jsonb;
begin
 select * into q from public.official_assistant_questions where id=p_id for update;
 if q.id is null then raise exception 'Question not found'; end if;
 if q.status<>'processing' then return q; end if;
 if p_status not in ('answered','needs_review','blocked','error') then raise exception 'Invalid status'; end if;
 select * into a from public.official_assistants where owner_id=q.owner_id for share;
 select * into v from public.verification_requests where user_id=q.owner_id for share;
 perform 1 from public.memberships where user_id=q.owner_id for share;
 if p_status='answered' then
   if not a.enabled or a.revision<>q.config_revision or v.updated_at is distinct from q.verification_updated_at
      or not private.official_assistant_eligible(q.owner_id) then p_status:='needs_review';
   else
     select value into faq from jsonb_array_elements(a.faqs) where value->>'id'=p_faq_id;
     if faq is null then p_status:='needs_review'; end if;
   end if;
 end if;
 update public.official_assistant_questions set status=p_status,
   answer=case when p_status='answered' then faq->>'answer' else null end,
   source_url=case when p_status='answered' then faq->>'source_url' else null end,
   faq_id=case when p_status='answered' then p_faq_id else null end,
   answer_label=case when p_status='answered' then 'AI assistant for '||v.legal_name||' · Approved FAQ answer' else null end,
   answered_at=now() where id=p_id returning * into q;
 return q;
end; $$;

create or replace function public.reply_official_question(p_id uuid,p_owner uuid,p_answer text)
returns void language plpgsql security invoker set search_path='' as $$
declare v public.verification_requests;
begin
 select * into v from public.verification_requests where user_id=p_owner for share;
 if not private.official_assistant_eligible(p_owner) then raise exception 'Current verified Premium account required'; end if;
 if char_length(p_answer) not between 1 and 2000 then raise exception 'Invalid reply'; end if;
 update public.official_assistant_questions set answer=p_answer,status='human_answered',
 answer_label='Reply from '||v.legal_name,source_url=null,faq_id=null,answered_at=now()
 where id=p_id and owner_id=p_owner and (status in ('needs_review','error') or (status='processing' and created_at<now()-interval '5 minutes'));
 if not found then raise exception 'Question unavailable for reply'; end if;
end; $$;

revoke all on function public.save_official_assistant(uuid,boolean,jsonb,uuid),public.pause_official_assistant(uuid),
 public.claim_official_question(uuid,uuid,uuid,text),public.finish_official_question(uuid,text,text),public.reply_official_question(uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.save_official_assistant(uuid,boolean,jsonb,uuid),public.pause_official_assistant(uuid),
 public.claim_official_question(uuid,uuid,uuid,text),public.finish_official_question(uuid,text,text),public.reply_official_question(uuid,uuid,text)
 to service_role;
commit;
