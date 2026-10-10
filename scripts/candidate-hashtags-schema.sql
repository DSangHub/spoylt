-- Candidate-owned hashtags. No subscription or payment grants verification.
begin;
create table public.candidate_hashtags (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  hashtag text not null unique check (hashtag ~ '^[a-z][a-z0-9_]{2,39}$'),
  created_at timestamptz not null default now()
);
alter table public.candidate_hashtags enable row level security;
revoke all on public.candidate_hashtags from public,anon,authenticated;
grant select on public.candidate_hashtags to authenticated;
grant insert(owner_id,hashtag),update(hashtag) on public.candidate_hashtags to authenticated;
grant all on public.candidate_hashtags to service_role;
create policy candidate_hashtag_owner_read on public.candidate_hashtags for select to authenticated
using ((select auth.uid())=owner_id);
create policy candidate_hashtag_verified_insert on public.candidate_hashtags for insert to authenticated
with check ((select auth.uid())=owner_id and exists (
  select 1 from public.verification_requests v where v.user_id=(select auth.uid())
  and v.verification_type='candidate' and v.status='verified' and v.identity_status='verified'
  and v.expires_at>now() and v.election_date>=current_date
));
create policy candidate_hashtag_verified_update on public.candidate_hashtags for update to authenticated
using ((select auth.uid())=owner_id and exists (
  select 1 from public.verification_requests v where v.user_id=(select auth.uid())
  and v.verification_type='candidate' and v.status='verified' and v.identity_status='verified'
  and v.expires_at>now() and v.election_date>=current_date
))
with check ((select auth.uid())=owner_id and exists (
  select 1 from public.verification_requests v where v.user_id=(select auth.uid())
  and v.verification_type='candidate' and v.status='verified' and v.identity_status='verified'
  and v.expires_at>now() and v.election_date>=current_date
));
commit;
