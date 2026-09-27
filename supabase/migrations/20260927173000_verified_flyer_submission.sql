-- Only reviewed, verified candidates and officials may submit private flyers.
-- The application form stays available to signed-in applicants.
drop policy if exists "Signed-in campaigns can save pending flyers" on public.political_flyers;
create policy "Verified campaigns can submit pending flyers" on public.political_flyers
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and status = 'pending_review'
    and reviewed_at is null and election_date >= current_date
    and exists (
      select 1 from public.verification_requests v
      where v.user_id = (select auth.uid()) and v.status = 'verified'
        and v.verification_type in ('candidate', 'official')
        and (v.expires_at is null or v.expires_at > now())
        and (v.election_date is null or v.election_date >= current_date)
        and (v.term_end is null or v.term_end >= current_date)
    )
  );
