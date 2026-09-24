-- Candidates can save a pending flyer on their profile before verification.
alter table public.political_flyers add column if not exists committee_id text;
alter table public.political_flyers add constraint political_flyers_ca_committee_id
  check (target_state <> 'CA' or (committee_id is not null and length(trim(committee_id)) between 4 and 40));

drop policy if exists "Verified campaigns can submit flyers" on public.political_flyers;
create policy "Signed-in campaigns can save pending flyers" on public.political_flyers
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and status = 'pending_review'
    and reviewed_at is null and election_date >= current_date
  );

-- The browser has no UPDATE grant or policy. The reviewer's service role may
-- approve only after confirming the candidate and the ID in official records.
create or replace function public.validate_political_flyer_approval()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'approved' then
    if new.election_date < current_date or not exists (
      select 1 from public.verification_requests v
      where v.user_id = new.owner_id and v.status = 'verified'
        and v.verification_type in ('candidate', 'official')
        and (v.expires_at is null or v.expires_at > now())
        and (v.election_date is null or v.election_date >= current_date)
        and (new.target_state <> 'CA' or
          (v.filing_id is not null and v.filing_id = new.committee_id))
    ) then
      raise exception 'Candidate/official and campaign ID must be verified before approval';
    end if;
    if new.reviewed_at is null then
      raise exception 'A reviewer must set reviewed_at before approval';
    end if;
  end if;
  return new;
end;
$$;

create trigger political_flyer_approval_guard
  before insert or update on public.political_flyers
  for each row execute function public.validate_political_flyer_approval();
