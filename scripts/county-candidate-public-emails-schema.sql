-- Public candidate contact emails must have a traceable source. Unpublished addresses stay NULL.
alter table public.county_election_candidates add column if not exists public_contact_email text;
alter table public.county_election_candidates add column if not exists contact_source_url text;
alter table public.county_election_candidates add column if not exists contact_reviewed_at timestamptz;
alter table public.county_election_candidates add constraint county_candidate_public_email_format
  check (public_contact_email is null or public_contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$');
alter table public.county_election_candidates add constraint county_candidate_email_source_required
  check (public_contact_email is null or contact_source_url is not null);
