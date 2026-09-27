-- Applicants may provide flyer content only. Population and fee are reviewer-owned.
drop policy if exists "Verified campaigns can submit pending flyers" on public.political_flyers;
create policy "Verified campaigns can submit pending flyers" on public.political_flyers
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and status = 'pending_review'
    and reviewed_at is null and election_date >= current_date
    and fee_geography_id is null and fee_amount_cents is null
    and fee_population is null and fee_population_year is null
    and stripe_checkout_session_id is null and stripe_payment_intent_id is null
    and payment_status = 'unpaid' and paid_at is null
    and exists (
      select 1 from public.verification_requests v
      where v.user_id = (select auth.uid()) and v.status = 'verified'
        and v.verification_type in ('candidate', 'official')
        and (v.expires_at is null or v.expires_at > now())
        and (v.election_date is null or v.election_date >= current_date)
        and (v.term_end is null or v.term_end >= current_date)
    )
  );
