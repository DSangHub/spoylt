begin;
alter table private.hashtag_email_jobs add column if not exists gmail_submitted_at timestamptz;
create or replace function public.claim_hashtag_email(p_id uuid,p_token uuid,p_configured boolean,p_sender text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.hashtag_email_jobs; email_address text; eligible boolean; new_lease uuid:=gen_random_uuid();
begin
 select * into j from private.hashtag_email_jobs where id=p_id and dispatch_token=p_token for update;
 if j.id is null then return null; end if;
 if j.state in ('sent','skipped','failed') or (j.state='processing' and j.next_attempt_at>now()) then return jsonb_build_object('status','no_work'); end if;
 if j.last_error='gmail_submission_started' then
  update private.hashtag_email_jobs set state='failed',last_error='Gmail outcome unknown; check Sent before manual retry' where id=j.id;
  return jsonb_build_object('status','failed');
 end if;
 select u.email,exists(select 1 from public.candidate_hashtags h join public.verification_requests v on v.user_id=h.owner_id
  where h.owner_id=j.owner_id and h.hashtag=j.hashtag and h.email_notifications
  and v.verification_type='candidate' and v.status='verified' and v.identity_status='verified'
  and v.expires_at>now() and v.election_date>=current_date)
 into email_address,eligible from auth.users u where u.id=j.owner_id and u.email_confirmed_at is not null;
 if not coalesce(eligible,false) or email_address is null or
    not exists(select 1 from public.propositions where id=j.proposition_id) or
    (j.source_type='comment' and not exists(select 1 from public.interactions where id=j.source_id and kind='comment')) or
    (j.recipient_email is not null and (j.recipient_email<>email_address or j.sender<>p_sender)) then
   update private.hashtag_email_jobs set state='skipped',last_error='Consent, verification, source or recipient changed' where id=j.id;
   return jsonb_build_object('status','skipped');
 end if;
 if not p_configured then
  update private.hashtag_email_jobs set state='queued',next_attempt_at=now()+interval '15 minutes',last_error='Email provider not configured' where id=j.id;
  return jsonb_build_object('status','configuration_missing');
 end if;
 if j.attempts>=8 or j.first_attempt_at<now()-interval '23 hours' then
  update private.hashtag_email_jobs set state='failed',last_error='Retry window exhausted' where id=j.id;
  return jsonb_build_object('status','failed');
 end if;
 update private.hashtag_email_jobs set state='processing',lease=new_lease,attempts=attempts+1,
  first_attempt_at=coalesce(first_attempt_at,now()),next_attempt_at=now()+interval '5 minutes',
  recipient_email=coalesce(recipient_email,email_address),sender=coalesce(sender,p_sender) where id=j.id;
 return jsonb_build_object('status','send','id',j.id,'lease',new_lease,'email',email_address,
  'hashtag',j.hashtag,'title',j.title,'excerpt',j.excerpt);
end $$;
create or replace function public.finish_hashtag_email(p_id uuid,p_lease uuid,p_result text,p_provider_id text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_result not in ('sent','retry','failed') then raise exception 'Invalid result'; end if;
 update private.hashtag_email_jobs set state=case when p_result='retry' then 'queued' else p_result end,
  provider_id=case when p_result='sent' then p_provider_id else provider_id end,
  last_error=case when p_result='sent' then null when p_result='failed' and last_error='gmail_submission_started' then 'Gmail rejected or outcome unknown; check Sent before manual retry' else p_result end,
  next_attempt_at=now()+interval '5 minutes'
 where id=p_id and lease=p_lease and state='processing';
end $$;
create or replace function public.begin_hashtag_gmail_submission(p_id uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(90495252);
 if not exists(select 1 from private.hashtag_email_jobs where id=p_id and lease=p_lease and state='processing' and last_error is distinct from 'gmail_submission_started') then return false; end if;
 -- Reserve capacity for manual outreach; Gmail's own account limits still apply.
 if (select count(*) from private.hashtag_email_jobs where gmail_submitted_at>now()-interval '24 hours')>=300 then return false; end if;
 update private.hashtag_email_jobs set gmail_submitted_at=now(),last_error='gmail_submission_started' where id=p_id and lease=p_lease and state='processing';
 return found;
end $$;
revoke all on function public.begin_hashtag_gmail_submission(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_hashtag_gmail_submission(uuid,uuid) to service_role;
create or replace function private.dispatch_hashtag_emails() returns void
language plpgsql security definer set search_path='' as $$
declare j record;
begin
 for j in select id,dispatch_token from private.hashtag_email_jobs
  where state in ('queued','processing') and next_attempt_at<=now() order by next_attempt_at limit 10 for update skip locked loop
  perform net.http_post(
   url:='https://xceamvdvjnutaovqpsbr.supabase.co/functions/v1/send-hashtag-email',
   headers:='{"Content-Type":"application/json"}'::jsonb,
   body:=jsonb_build_object('job_id',j.id,'token',j.dispatch_token),timeout_milliseconds:=20000);
  update private.hashtag_email_jobs set next_attempt_at=now()+interval '30 seconds' where id=j.id and state='queued';
 end loop;
end $$;
commit;
