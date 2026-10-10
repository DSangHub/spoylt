begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('b1111111-1111-4111-8111-111111111111','mention-owner@example.invalid',now()),
 ('b2222222-2222-4222-8222-222222222222','mention-author@example.invalid',now());
insert into public.verification_requests(user_id,verification_type,legal_name,office_title,jurisdiction,authoritative_source_url,identity_status,status,reviewed_at,election_date,expires_at)
values ('b1111111-1111-4111-8111-111111111111','candidate','Mention Test','Council','Test','https://example.invalid/filing','verified','verified',now(),'2099-11-03','2099-11-04');
insert into public.candidate_hashtags(owner_id,hashtag,email_notifications) values('b1111111-1111-4111-8111-111111111111','mention_fixture',true);
insert into public.propositions(id,user_id,category,title,suggestion) values('b3333333-3333-4333-8333-333333333333','b2222222-2222-4222-8222-222222222222','housing','Mention test','Hi #MENTION_FIXTURE and #mention_fixture.');
do $$ declare j private.hashtag_email_jobs; r jsonb; begin
 if (select count(*) from private.hashtag_email_jobs where proposition_id='b3333333-3333-4333-8333-333333333333')<>1 then raise exception 'Repeated/case insensitive matching failed'; end if;
 select * into j from private.hashtag_email_jobs where proposition_id='b3333333-3333-4333-8333-333333333333';
 if public.claim_hashtag_email(j.id,gen_random_uuid(),true,'alerts@spoylt.org') is not null then raise exception 'Wrong dispatch token accepted'; end if;
 r:=public.claim_hashtag_email(j.id,j.dispatch_token,false,'');
 if r->>'status'<>'configuration_missing' then raise exception 'Missing configuration did not pause'; end if;
 if (select attempts from private.hashtag_email_jobs where id=j.id)<>0 then raise exception 'Missing configuration consumed retry'; end if;
 r:=public.claim_hashtag_email(j.id,j.dispatch_token,true,'alerts@spoylt.org');
 if r->>'status'<>'send' or r->>'email'<>'mention-owner@example.invalid' then raise exception 'Verified consented recipient not claimed'; end if;
 if public.claim_hashtag_email(j.id,j.dispatch_token,true,'alerts@spoylt.org')->>'status'<>'no_work' then raise exception 'Concurrent duplicate allowed'; end if;
 if public.begin_hashtag_gmail_submission(j.id,gen_random_uuid()) then raise exception 'Invalid lease can submit Gmail'; end if;
 if not public.begin_hashtag_gmail_submission(j.id,(r->>'lease')::uuid) then raise exception 'Valid lease cannot submit'; end if;
 if public.begin_hashtag_gmail_submission(j.id,(r->>'lease')::uuid) then raise exception 'Duplicate submission allowed'; end if;
 update private.hashtag_email_jobs set next_attempt_at=now()-interval '1 minute' where id=j.id;
 if public.claim_hashtag_email(j.id,j.dispatch_token,true,'alerts@spoylt.org')->>'status'<>'failed' then raise exception 'Uncertain submission retried'; end if;

 if public.claim_hashtag_email(j.id,j.dispatch_token,true,'alerts@spoylt.org')->>'status'<>'no_work' then raise exception 'Sent job replayed'; end if;
end $$;
insert into public.interactions(proposition_id,user_id,kind,body) values
 ('b3333333-3333-4333-8333-333333333333','b2222222-2222-4222-8222-222222222222','comment','Hi #mention_fixture_extra and x#mention_fixture and ##mention_fixture');
do $$ begin
 if (select count(*) from private.hashtag_email_jobs where source_type='comment' and owner_id='b1111111-1111-4111-8111-111111111111')<>0 then raise exception 'Partial token matched'; end if;
end $$;
insert into public.interactions(proposition_id,user_id,kind,body) values
 ('b3333333-3333-4333-8333-333333333333','b2222222-2222-4222-8222-222222222222','comment','Hello #mention_fixture!');
update public.candidate_hashtags set email_notifications=false where owner_id='b1111111-1111-4111-8111-111111111111';
do $$ declare j private.hashtag_email_jobs; begin
 select * into j from private.hashtag_email_jobs where source_type='comment' and owner_id='b1111111-1111-4111-8111-111111111111';
 if public.claim_hashtag_email(j.id,j.dispatch_token,true,'alerts@spoylt.org')->>'status'<>'skipped' then raise exception 'Opt-out did not suppress queued send'; end if;
end $$;
insert into public.interactions(proposition_id,user_id,kind,body) values
 ('b3333333-3333-4333-8333-333333333333','b2222222-2222-4222-8222-222222222222','comment','Opted out #mention_fixture');
do $$ begin
 if (select count(*) from private.hashtag_email_jobs where owner_id='b1111111-1111-4111-8111-111111111111')<>2 then raise exception 'Opt-out queued a notification'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin
  perform public.begin_hashtag_gmail_submission(gen_random_uuid(),gen_random_uuid());
  raise exception using errcode='XX000',message='Browser can claim jobs';
 exception when insufficient_privilege then null; end;
 begin
  perform 1 from private.hashtag_email_jobs;
  raise exception using errcode='XX000',message='Browser sees queue';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: Gmail submission gate, duplicate/crash protection, consent and client denial' as result;
