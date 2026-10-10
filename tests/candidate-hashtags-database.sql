-- Test-only identities and hashtag reservations are rolled back.
begin;
insert into auth.users(id,email) values
 ('a1111111-1111-4111-8111-111111111111','hashtag-a@example.invalid'),
 ('a2222222-2222-4222-8222-222222222222','hashtag-b@example.invalid'),
 ('a3333333-3333-4333-8333-333333333333','hashtag-unverified@example.invalid');
insert into public.verification_requests(user_id,verification_type,legal_name,office_title,jurisdiction,authoritative_source_url,identity_status,status,reviewed_at,election_date,expires_at)
values
 ('a1111111-1111-4111-8111-111111111111','candidate','Hashtag A','Council','Test','https://example.invalid/filing','verified','verified',now(),'2099-11-03','2099-11-04'),
 ('a2222222-2222-4222-8222-222222222222','candidate','Hashtag B','Council','Test','https://example.invalid/filing','verified','verified',now(),'2099-11-03','2099-11-04');
set local request.jwt.claims='{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;
insert into public.candidate_hashtags(owner_id,hashtag) values('a1111111-1111-4111-8111-111111111111','hashtag_fixture_a');
update public.candidate_hashtags set hashtag='hashtag_fixture_updated' where owner_id='a1111111-1111-4111-8111-111111111111';
do $$ begin
 if not exists(select 1 from public.candidate_hashtags where hashtag='hashtag_fixture_updated') then raise exception 'Verified save failed'; end if;
 begin
  insert into public.candidate_hashtags(owner_id,hashtag) values('a2222222-2222-4222-8222-222222222222','hashtag_impersonation');
  raise exception using errcode='XX000',message='Ownership bypass';
 exception when insufficient_privilege then null; end;
 begin
  update public.candidate_hashtags set owner_id='a2222222-2222-4222-8222-222222222222';
  raise exception using errcode='XX000',message='Ownership transfer allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.candidate_hashtags set hashtag='Bad tag!';
  raise exception using errcode='XX000',message='Invalid format accepted';
 exception when check_violation then null; end;
end $$;
reset role;
set local request.jwt.claims='{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.candidate_hashtags) then raise exception 'Other owner visible'; end if;
 begin
  insert into public.candidate_hashtags(owner_id,hashtag) values('a2222222-2222-4222-8222-222222222222','hashtag_fixture_updated');
  raise exception using errcode='XX000',message='Duplicate hashtag accepted';
 exception when unique_violation then null; end;
end $$;
reset role;
update public.verification_requests set status='revoked' where user_id='a1111111-1111-4111-8111-111111111111';
set local request.jwt.claims='{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;
do $$ declare changed integer; begin
 update public.candidate_hashtags set hashtag='revoked_change';
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Revoked user can update'; end if;
end $$;
reset role;
set local request.jwt.claims='{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}';
set local role authenticated;
do $$ begin
 begin
  insert into public.candidate_hashtags(owner_id,hashtag) values('a3333333-3333-4333-8333-333333333333','unverified_fixture');
  raise exception using errcode='XX000',message='Unverified user can reserve';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.verification_requests set expires_at=now()-interval '1 day' where user_id='a2222222-2222-4222-8222-222222222222';
set local request.jwt.claims='{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}';
set local role authenticated;
do $$ begin
 begin
  insert into public.candidate_hashtags(owner_id,hashtag) values('a2222222-2222-4222-8222-222222222222','expired_fixture');
  raise exception using errcode='XX000',message='Expired user can reserve';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform 1 from public.candidate_hashtags;
  raise exception using errcode='XX000',message='Anonymous read allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: verified save, uniqueness, ownership, format, unverified, revoked, expired and anonymous access' as result;
