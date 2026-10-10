begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
-- Keep net outside PostgREST exposed schemas: its internal HTTP queue contains dispatch tokens.
create table private.hashtag_email_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 source_type text not null check(source_type in ('comment','proposition')),
 source_id uuid not null,
 proposition_id uuid not null references public.propositions(id) on delete cascade,
 hashtag text not null,
 title text not null,
 excerpt text not null,
 dispatch_token uuid not null default gen_random_uuid(),
 lease uuid,
 state text not null default 'queued' check(state in ('queued','processing','sent','skipped','failed')),
 attempts integer not null default 0,
 first_attempt_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 recipient_email text,
 sender text,
 provider_id text,
 last_error text,
 created_at timestamptz not null default now(),
 unique(owner_id,source_type,source_id)
);
alter table private.hashtag_email_jobs enable row level security;
revoke all on private.hashtag_email_jobs from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.hashtag_email_jobs to service_role;
create index hashtag_email_queue on private.hashtag_email_jobs(next_attempt_at) where state in ('queued','processing');

create function private.queue_hashtag_mentions() returns trigger
language plpgsql security definer set search_path='' as $$
declare content text; source_kind text; prop_id uuid; heading text;
begin
 if tg_table_name='interactions' then
  if new.kind<>'comment' then return new; end if;
  content:=coalesce(new.body,''); source_kind:='comment'; prop_id:=new.proposition_id;
  select title into heading from public.propositions where id=prop_id;
 else
  content:=new.title||E'\n'||new.suggestion; source_kind:='proposition'; prop_id:=new.id; heading:=new.title;
 end if;
 insert into private.hashtag_email_jobs(owner_id,source_type,source_id,proposition_id,hashtag,title,excerpt)
 select distinct h.owner_id,source_kind,new.id,prop_id,h.hashtag,left(heading,160),left(content,1200)
 from regexp_matches(content,'(^|[^[:alnum:]_#])#([a-z][a-z0-9_]{2,39})(?=$|[^[:alnum:]_])','gi') m
 join public.candidate_hashtags h on h.hashtag=lower(m[2])
 join public.verification_requests v on v.user_id=h.owner_id
 where h.email_notifications and h.owner_id<>new.user_id
 and v.verification_type='candidate' and v.status='verified' and v.identity_status='verified'
 and v.expires_at>now() and v.election_date>=current_date
 on conflict(owner_id,source_type,source_id) do nothing;
 return new;
end $$;
revoke all on function private.queue_hashtag_mentions() from public,anon,authenticated;
create trigger comment_hashtag_mentions after insert on public.interactions for each row execute function private.queue_hashtag_mentions();
create trigger proposition_hashtag_mentions after insert on public.propositions for each row execute function private.queue_hashtag_mentions();

-- Only the service worker may redeem the opaque, per-job dispatch token.
create function public.claim_hashtag_email(p_id uuid,p_token uuid,p_configured boolean,p_sender text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.hashtag_email_jobs; email_address text; eligible boolean; new_lease uuid:=gen_random_uuid();
begin
 select * into j from private.hashtag_email_jobs where id=p_id and dispatch_token=p_token for update;
 if j.id is null then return null; end if;
 if j.state in ('sent','skipped','failed') or (j.state='processing' and j.next_attempt_at>now()) then return jsonb_build_object('status','no_work'); end if;
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
create function public.finish_hashtag_email(p_id uuid,p_lease uuid,p_result text,p_provider_id text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_result not in ('sent','retry','failed') then raise exception 'Invalid result'; end if;
 update private.hashtag_email_jobs set state=case when p_result='retry' then 'queued' else p_result end,
  provider_id=case when p_result='sent' then p_provider_id else provider_id end,
  last_error=case when p_result='sent' then null else p_result end,
  next_attempt_at=now()+interval '5 minutes'
 where id=p_id and lease=p_lease and state='processing';
end $$;
revoke all on function public.claim_hashtag_email(uuid,uuid,boolean,text),public.finish_hashtag_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_hashtag_email(uuid,uuid,boolean,text),public.finish_hashtag_email(uuid,uuid,text,text) to service_role;

-- Dispatch tokens stay in the private queue and are not exposed to clients.
create function private.dispatch_hashtag_emails() returns void
language plpgsql security definer set search_path='' as $$
declare j record;
begin
 for j in select id,dispatch_token from private.hashtag_email_jobs
  where state in ('queued','processing') and next_attempt_at<=now() order by next_attempt_at limit 10 for update skip locked loop
  perform net.http_post(
   url:='https://xceamvdvjnutaovqpsbr.supabase.co/functions/v1/send-hashtag-email',
   headers:='{"Content-Type":"application/json"}'::jsonb,
   body:=jsonb_build_object('job_id',j.id,'token',j.dispatch_token),timeout_milliseconds:=20000);
  update private.hashtag_email_jobs set state='queued',next_attempt_at=now()+interval '5 minutes' where id=j.id;
 end loop;
end $$;
revoke all on function private.dispatch_hashtag_emails() from public,anon,authenticated;
select cron.schedule('spoylt-hashtag-emails','* * * * *','select private.dispatch_hashtag_emails()');
commit;
