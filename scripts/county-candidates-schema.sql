-- Official election roster. A source covers one county and election; entries are
-- ballot appearances, not verified SPOYLT accounts or endorsements.
create table if not exists public.county_candidate_sources (
  id uuid primary key default gen_random_uuid(),
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  county_name text not null,
  election_date date not null,
  election_name text not null,
  source_url text not null check (source_url ~ '^https://'),
  source_published_on date,
  source_type text not null default 'county_elections_office'
    check (source_type in ('county_elections_office', 'state_elections_office')),
  coverage_status text not null default 'in_progress'
    check (coverage_status in ('in_progress', 'source_complete')),
  coverage_note text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (state_code, county_name, election_date, source_url)
);

create table if not exists public.county_election_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.county_candidate_sources(id) on delete restrict,
  contest_code text not null,
  office_name text not null,
  district text,
  jurisdiction_level text not null
    check (jurisdiction_level in ('county', 'city', 'school', 'special_district', 'other')),
  seats_to_fill integer not null check (seats_to_fill > 0),
  candidate_name text not null,
  candidate_number integer not null check (candidate_number > 0),
  ballot_status text not null default 'qualified_on_ballot'
    check (ballot_status in ('qualified_on_ballot', 'qualified_not_on_ballot', 'withdrawn', 'other')),
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (source_id, contest_code, candidate_number)
);

create index if not exists county_candidates_lookup_idx
  on public.county_candidate_sources (state_code, county_name, election_date);
create index if not exists county_candidates_contest_idx
  on public.county_election_candidates (source_id, contest_code);

alter table public.county_candidate_sources enable row level security;
alter table public.county_election_candidates enable row level security;

revoke all on public.county_candidate_sources, public.county_election_candidates from public, anon, authenticated;
grant select on public.county_candidate_sources, public.county_election_candidates to anon, authenticated;
grant all on public.county_candidate_sources to service_role;
grant all on public.county_election_candidates to service_role;

create policy "Public can read official roster sources"
  on public.county_candidate_sources for select to anon, authenticated using (true);
create policy "Public can read published ballot entries"
  on public.county_election_candidates for select to anon, authenticated using (published);
