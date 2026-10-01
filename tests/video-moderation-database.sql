-- Administrator-only checks. Every fixture and state change rolls back.
begin;
insert into auth.users(id,email) values ('11111111-1111-4111-8111-111111111111','video-audit@example.invalid');
insert into public.verification_requests
  (user_id,verification_type,legal_name,office_title,jurisdiction,authoritative_source_url,identity_status,status,reviewed_at,election_date)
values ('11111111-1111-4111-8111-111111111111','candidate','Video Audit Candidate','Council District 3','New York City',
  'https://example.invalid/filing','verified','verified',now(),'2099-11-03');
insert into public.candidate_videos(id,owner_id,storage_path,title,paid_for_by,target_zip,election_date)
values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.mp4',
  'Video audit fixture','Audit Committee','10001','2099-11-03');
do $$ begin
  begin
    update public.candidate_videos set status='approved',reviewed_at=now()
      where id='22222222-2222-4222-8222-222222222222';
    raise exception using errcode='XX000',message='Unscreened approval allowed';
  exception when raise_exception then null; end;
  if public.claim_candidate_video_screen('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111') is null
    then raise exception 'Initial screening not claimed'; end if;
  if public.claim_candidate_video_screen('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111') is not null
    then raise exception 'Concurrent screening duplicated'; end if;
end $$;
update public.candidate_video_moderation set status='passed',checked_at=now(),content_sha256=repeat('a',64),
  verification_id=(select id from public.verification_requests where user_id='11111111-1111-4111-8111-111111111111'),
  verification_updated_at=(select updated_at from public.verification_requests where user_id='11111111-1111-4111-8111-111111111111')
where video_id='22222222-2222-4222-8222-222222222222';
do $$ begin
  begin
    update public.candidate_videos set status='approved',reviewed_at=now()
      where id='22222222-2222-4222-8222-222222222222';
    raise exception using errcode='XX000',message='Approval without human identity/visual review allowed';
  exception when raise_exception then null; end;
end $$;
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;
do $$ begin
  begin
    update public.candidate_video_moderation set status='passed';
    raise exception using errcode='XX000',message='Browser can forge moderation';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_candidate_video_screen('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');
    raise exception using errcode='XX000',message='Browser can call privileged claim';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.candidate_videos(id,owner_id,storage_path,title,paid_for_by,target_zip,election_date,moderation_status)
    values ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.mp4','Forged moderation','Audit Committee','10001','2099-11-03','passed');
    raise exception using errcode='XX000',message='Browser can insert forged screening status';
  exception when raise_exception then null; end;
end $$;
reset role;
update public.candidate_video_moderation set manual_identity_confirmed=true,manual_visual_confirmed=true,
  reviewer_identifier='transactional-audit',review_notes='Full human identity and visual review test fixture.'
where video_id='22222222-2222-4222-8222-222222222222';
update public.candidate_videos set status='approved',reviewed_at=now() where id='22222222-2222-4222-8222-222222222222';
set local role anon;
do $$ begin
  if (select count(*) from public.candidate_videos where id='22222222-2222-4222-8222-222222222222')<>1
    then raise exception 'Reviewed video not public'; end if;
  begin
    perform transcript from public.candidate_video_moderation;
    raise exception using errcode='XX000',message='Transcript leaked publicly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.verification_requests set status='revoked' where user_id='11111111-1111-4111-8111-111111111111';
set local role anon;
do $$ begin
  if exists (select 1 from public.candidate_videos where id='22222222-2222-4222-8222-222222222222')
    then raise exception 'Revoked candidate video still public'; end if;
end $$;
reset role;
update public.candidate_video_moderation set status='flagged',profanity=true where video_id='22222222-2222-4222-8222-222222222222';
do $$ begin
  if (select status from public.candidate_videos where id='22222222-2222-4222-8222-222222222222')<>'paused'
    then raise exception 'Flagged publication not paused'; end if;
  begin
    update public.candidate_videos set title='Changed recording' where id='22222222-2222-4222-8222-222222222222';
    raise exception using errcode='XX000',message='Reviewed metadata mutable';
  exception when raise_exception then null; end;
end $$;
rollback;
select 'PASS: transactional video approval, ownership, privacy, concurrency, revocation, and immutability checks' as result;
