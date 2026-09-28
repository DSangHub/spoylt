-- Candidate videos are private until a trusted reviewer approves identity, content, and ZIP placement.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('candidate-videos', 'candidate-videos', false, 52428800, array['video/mp4'])
on conflict (id) do update set public = false, file_size_limit = 52428800,
  allowed_mime_types = array['video/mp4'];

create table public.candidate_videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  title text not null check (char_length(title) between 5 and 140),
  paid_for_by text not null check (char_length(paid_for_by) between 3 and 180),
  committee_id text,
  target_zip text not null check (target_zip ~ '^[0-9]{5}$'),
  election_date date not null,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'paused')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (storage_path = owner_id::text || '/' || id::text || '.mp4')
);
create index candidate_videos_public_zip_idx on public.candidate_videos (target_zip, election_date)
  where status = 'approved';
alter table public.candidate_videos enable row level security;
grant select on public.candidate_videos to anon;
grant select, insert on public.candidate_videos to authenticated;

create policy "Published candidate videos" on public.candidate_videos for select to anon, authenticated
  using (status = 'approved' and reviewed_at is not null and election_date >= current_date);
create policy "Candidate views own video" on public.candidate_videos for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Verified candidate submits video" on public.candidate_videos for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and status = 'pending_review' and reviewed_at is null
    and election_date >= current_date
    and exists (select 1 from public.verification_requests v
      where v.user_id = (select auth.uid()) and v.status = 'verified'
        and v.verification_type = 'candidate'
        and (v.expires_at is null or v.expires_at > now())
        and (v.election_date is null or v.election_date >= current_date)
        and (v.filing_id is null or v.filing_id = committee_id))
  );

create function public.validate_candidate_video_approval() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'approved' then
    if new.reviewed_at is null or new.election_date < current_date or not exists (
      select 1 from public.verification_requests v where v.user_id = new.owner_id
        and v.status = 'verified' and v.verification_type = 'candidate'
        and (v.expires_at is null or v.expires_at > now())
        and (v.election_date is null or v.election_date >= current_date)
        and (v.filing_id is null or v.filing_id = new.committee_id)
    ) then raise exception 'Current candidate verification and review are required'; end if;
  end if;
  return new;
end;
$$;
create trigger candidate_video_approval before insert or update on public.candidate_videos
for each row execute function public.validate_candidate_video_approval();

create policy "Verified candidate uploads own MP4" on storage.objects for insert to authenticated
  with check (bucket_id = 'candidate-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]mp4$'
    and exists (select 1 from public.verification_requests v where v.user_id = (select auth.uid())
      and v.status = 'verified' and v.verification_type = 'candidate'
      and (v.expires_at is null or v.expires_at > now())
      and (v.election_date is null or v.election_date >= current_date)));
create policy "Candidate reads own private video" on storage.objects for select to authenticated
  using (bucket_id = 'candidate-videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Public reads reviewed video" on storage.objects for select to anon, authenticated
  using (bucket_id = 'candidate-videos' and exists (
    select 1 from public.candidate_videos v where v.storage_path = name
      and v.status = 'approved' and v.reviewed_at is not null and v.election_date >= current_date));
-- Deliberately no browser UPDATE/DELETE policy for video records or files.
