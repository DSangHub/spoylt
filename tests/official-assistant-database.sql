-- All fixtures and mutations roll back. Run as a trusted administrator.
begin;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','assistant-owner@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','assistant-visitor@example.invalid'),
 ('33333333-3333-4333-8333-333333333333','assistant-other@example.invalid');
insert into public.verification_requests(user_id,verification_type,legal_name,office_title,jurisdiction,authoritative_source_url,identity_status,status,reviewed_at,election_date,expires_at)
values('11111111-1111-4111-8111-111111111111','candidate','Assistant Test','Council','Test City','https://example.invalid/filing','verified','verified',now(),'2099-11-03','2099-11-04'::timestamptz);
update public.memberships set plan='premium',status='active',current_period_end=now()+interval '1 day' where user_id='11111111-1111-4111-8111-111111111111';
insert into public.memberships(user_id,plan,status,current_period_end) values('11111111-1111-4111-8111-111111111111','premium','active',now()+interval '1 day') on conflict(user_id) do nothing;
set local role service_role;
select public.save_official_assistant('11111111-1111-4111-8111-111111111111',true,
 '[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","question":"Hours?","answer":"9 AM to 5 PM","source_url":"https://example.invalid/hours"}]',null);
do $$ declare c jsonb; again jsonb; q public.official_assistant_questions; begin
 c:=public.claim_official_question('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','Hours?');
 again:=public.claim_official_question('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','Hours?');
 if not (c->>'claimed')::boolean or (again->>'claimed')::boolean then raise exception 'Duplicate provider claim'; end if;
 q:=public.finish_official_question((c->'question'->>'id')::uuid,'answered','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 if q.answer<>'9 AM to 5 PM' or q.answer_label not like 'AI assistant for %' then raise exception 'Answer not bound to approved FAQ'; end if;
 c:=public.claim_official_question('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555','Another question');
 perform public.pause_official_assistant('11111111-1111-4111-8111-111111111111');
 q:=public.finish_official_question((c->'question'->>'id')::uuid,'answered','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 if q.status<>'needs_review' or q.answer is not null then raise exception 'Pause did not stop in-flight answer'; end if;
 perform public.reply_official_question(q.id,'11111111-1111-4111-8111-111111111111','Human reviewed answer');
 if (select status from public.official_assistant_questions where id=q.id)<>'human_answered' then raise exception 'Manual handoff failed'; end if;
end $$;
reset role;
set local request.jwt.claims='{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.official_assistants) or exists(select 1 from public.official_assistant_questions) then raise exception 'Unrelated user sees private data'; end if;
 begin
  perform public.pause_official_assistant('11111111-1111-4111-8111-111111111111');
  raise exception using errcode='XX000',message='User can change another assistant';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.official_assistants(owner_id,enabled) values('33333333-3333-4333-8333-333333333333',false);
  raise exception using errcode='XX000',message='Browser can bypass FAQ check';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.official_assistants set enabled=true where owner_id='11111111-1111-4111-8111-111111111111';
do $$ begin
 if not exists(select 1 from public.list_official_assistants() where owner_id='11111111-1111-4111-8111-111111111111') then raise exception 'Opt-in directory missing'; end if;
end $$;
update public.verification_requests set status='revoked' where user_id='11111111-1111-4111-8111-111111111111';
do $$ begin
 if exists(select 1 from public.list_official_assistants() where owner_id='11111111-1111-4111-8111-111111111111') then raise exception 'Revoked identity remains enabled'; end if;
 begin
  perform public.claim_official_question('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666','Revoked');
  raise exception using errcode='XX000',message='Revoked identity answered';
 exception when raise_exception then null; end;
end $$;
rollback;
select 'PASS: opt-in, approved FAQ binding, idempotency, private inbox, service-only mutations, pause and revocation' as result;
