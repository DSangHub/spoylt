-- Distinguish qualified write-in candidates from names printed on the ballot.
alter table public.county_election_candidates drop constraint county_election_candidates_ballot_status_check;
alter table public.county_election_candidates add constraint county_election_candidates_ballot_status_check
  check (ballot_status in ('qualified_on_ballot','qualified_not_on_ballot','qualified_write_in','withdrawn','other'));
