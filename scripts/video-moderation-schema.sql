-- Apply with Supabase migration name candidate_video_moderation.
-- AI speech screening never publishes a video or authenticates a face/voice.
-- Abort rather than alter visibility for any pre-existing submission.
lock table public.candidate_videos in share row exclusive mode;
do $$ begin
  if exists (select 1 from public.candidate_videos) then
    raise exception 'Review existing video submissions before installing moderation gates';
  end if;
end $$;
create schema if not exists private;

alter table public.candidate_videos add column moderation_status text not null default 'queued'
  check (moderation_status in ('queued','processing','passed','flagged','error'));

create table public.candidate_video_moderation (
  video_id uuid primary key references public.candidate_videos(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','passed','flagged','error')),
  lease_id uuid,
  attempts integer not null default 0,
  started_at timestamptz,
  checked_at timestamptz,
  transcript text,
  profanity boolean not null default false,
  suspected_impersonation boolean not null default false,
  findings jsonb not null default '{}'::jsonb,
  content_sha256 text,
  verification_id uuid references public.verification_requests(id),
  verification_updated_at timestamptz,
  manual_identity_confirmed boolean not null default false,
  manual_visual_confirmed boolean not null default false,
  reviewer_identifier text,
  review_notes text
);
alter table public.candidate_video_moderation enable row level security;
revoke all on public.candidate_video_moderation from public, anon, authenticated;
grant all on public.candidate_video_moderation to service_role;
-- Transcripts and internal assessments have no public or browser access.

create function public.claim_candidate_video_screen(p_video_id uuid, p_owner_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare claim uuid := gen_random_uuid(); daily_attempts integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));
  if not exists (select 1 from public.candidate_videos where id=p_video_id
    and owner_id=p_owner_id and status='pending_review') then
    raise exception 'Pending owner submission required';
  end if;
  select coalesce(sum(m.attempts),0) into daily_attempts
    from public.candidate_video_moderation m join public.candidate_videos v on v.id=m.video_id
    where v.owner_id=p_owner_id and m.started_at >= date_trunc('day', now());
  if daily_attempts >= 5 then raise exception 'Daily video screening limit reached'; end if;
  insert into public.candidate_video_moderation(video_id,status,lease_id,attempts,started_at)
    values(p_video_id,'processing',claim,1,now())
    on conflict(video_id) do update set status='processing',lease_id=claim,
      attempts=public.candidate_video_moderation.attempts+1,started_at=now(),
      manual_identity_confirmed=false,manual_visual_confirmed=false,reviewer_identifier=null,review_notes=null
    where public.candidate_video_moderation.attempts < 3 and
      (public.candidate_video_moderation.status in ('queued','error') or
       (public.candidate_video_moderation.status='processing' and
        public.candidate_video_moderation.started_at < now()-interval '5 minutes'));
  if not found then return null; end if;
  return claim;
end;
$$;
revoke all on function public.claim_candidate_video_screen(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_candidate_video_screen(uuid,uuid) to service_role;

create function private.sync_video_screen_status() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update public.candidate_videos set moderation_status=new.status,
    status=case when new.status <> 'passed' and status='approved' then 'paused' else status end
    where id=new.video_id;
  return new;
end;
$$;
create trigger sync_video_screen after insert or update of status on public.candidate_video_moderation
  for each row execute function private.sync_video_screen_status();

create function private.guard_video_screen_status() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    if (tg_op='INSERT' and new.moderation_status <> 'queued') or
       (tg_op='UPDATE' and new.moderation_status is distinct from old.moderation_status) then
      raise exception 'Only the trusted screening service may set moderation status';
    end if;
  end if;
  if tg_op='UPDATE' and (new.owner_id,new.storage_path,new.title,new.paid_for_by,new.committee_id,new.target_zip,new.election_date)
    is distinct from (old.owner_id,old.storage_path,old.title,old.paid_for_by,old.committee_id,old.target_zip,old.election_date) then
    raise exception 'Reviewed submission data is immutable; submit a new video';
  end if;
  return new;
end;
$$;
create trigger a_guard_video_screen before insert or update on public.candidate_videos
  for each row execute function private.guard_video_screen_status();

-- Only a boolean eligibility result is exposed; private transcripts/identity records stay private.
-- SECURITY DEFINER is needed because anonymous users cannot read those underlying records.
create function private.candidate_video_publishable(p_video_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.candidate_videos c
    join public.candidate_video_moderation m on m.video_id=c.id
    join public.verification_requests v on v.id=m.verification_id and v.user_id=c.owner_id
    where c.id=p_video_id and c.status='approved' and c.reviewed_at is not null
      and c.election_date >= current_date and c.moderation_status='passed'
      and m.status='passed' and m.checked_at is not null and m.content_sha256 ~ '^[0-9a-f]{64}$'
      and not m.profanity and not m.suspected_impersonation
      and m.manual_identity_confirmed and m.manual_visual_confirmed
      and length(trim(m.reviewer_identifier)) > 0 and length(trim(m.review_notes)) >= 10
      and v.updated_at=m.verification_updated_at and v.status='verified' and v.identity_status='verified'
      and v.verification_type='candidate' and v.authoritative_source_url ~ '^https://'
      and (v.expires_at is null or v.expires_at>now())
      and (v.election_date is null or v.election_date>=current_date)
      and (v.filing_id is null or v.filing_id=c.committee_id)
  );
$$;
revoke all on function private.candidate_video_publishable(uuid) from public;
grant usage on schema private to anon,authenticated,service_role;
grant execute on function private.candidate_video_publishable(uuid) to anon,authenticated,service_role;

-- Existing approval trigger is retained and strengthened.
create or replace function public.validate_candidate_video_approval() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status='approved' then
    if new.reviewed_at is null or new.election_date<current_date or new.moderation_status<>'passed' or not exists (
      select 1 from public.candidate_video_moderation m
      join public.verification_requests v on v.id=m.verification_id and v.user_id=new.owner_id
      where m.video_id=new.id and m.status='passed' and m.checked_at is not null
        and m.content_sha256 ~ '^[0-9a-f]{64}$' and not m.profanity and not m.suspected_impersonation
        and m.manual_identity_confirmed and m.manual_visual_confirmed
        and length(trim(m.reviewer_identifier))>0 and length(trim(m.review_notes))>=10
        and v.updated_at=m.verification_updated_at and v.status='verified' and v.identity_status='verified'
        and v.verification_type='candidate' and v.authoritative_source_url ~ '^https://'
        and (v.expires_at is null or v.expires_at>now())
        and (v.election_date is null or v.election_date>=current_date)
        and (v.filing_id is null or v.filing_id=new.committee_id)
    ) then raise exception 'Completed language screening and human identity/visual review are required'; end if;
  end if;
  return new;
end;
$$;
drop policy "Published candidate videos" on public.candidate_videos;
create policy "Published candidate videos" on public.candidate_videos for select to anon,authenticated
  using (private.candidate_video_publishable(id));
drop policy "Public reads reviewed video" on storage.objects;
create policy "Public reads reviewed video" on storage.objects for select to anon,authenticated
  using (bucket_id='candidate-videos' and exists (
    select 1 from public.candidate_videos v where v.storage_path=name and private.candidate_video_publishable(v.id)));

-- Do not change storage upload limits or bulk-update publication status.
-- This project has no video submissions at installation. Screening gates apply
-- to future submissions; provider limits keep oversized recordings private.
