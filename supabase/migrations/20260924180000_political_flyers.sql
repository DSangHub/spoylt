-- Reviewed political flyers. Approval is performed by a trusted administrator,
-- never by the campaign's browser session.
create table if not exists public.political_flyers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  headline text not null check (char_length(headline) between 5 and 140),
  body text not null check (char_length(body) between 10 and 1200),
  paid_for_by text not null check (char_length(paid_for_by) between 3 and 180),
  target_state text not null check (target_state ~ '^[A-Z]{2}$'),
  target_scope text not null check (target_scope in ('state','county','city')),
  target_county text,
  target_city text,
  election_date date not null,
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','paused')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((target_scope = 'state' and target_county is null and target_city is null)
    or (target_scope = 'county' and target_county is not null and target_city is null)
    or (target_scope = 'city' and target_city is not null and target_county is not null))
);

create index if not exists political_flyers_target_idx
  on public.political_flyers (target_state,target_scope,target_county,target_city,election_date)
  where status = 'approved';

alter table public.political_flyers enable row level security;
grant select on public.political_flyers to anon;
grant select, insert on public.political_flyers to authenticated;

create policy "Public can see current approved flyers" on public.political_flyers
  for select to anon, authenticated
  using (status = 'approved' and reviewed_at is not null and election_date >= current_date);

create policy "Owners can see their submitted flyers" on public.political_flyers
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "Verified campaigns can submit flyers" on public.political_flyers
  for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and status = 'pending_review' and reviewed_at is null
    and election_date >= current_date
    and exists (
      select 1 from public.verification_requests v
      where v.user_id = (select auth.uid()) and v.status = 'verified'
        and v.verification_type in ('candidate','official')
        and (v.expires_at is null or v.expires_at > now())
        and (v.election_date is null or v.election_date >= current_date)
    )
  );

-- No update/delete policy: only a trusted server-side reviewer may change status.
