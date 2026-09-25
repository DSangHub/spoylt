-- One-time $495 charge per reviewed flyer. Never trust browser payment flags.
alter table public.political_flyers drop constraint political_flyers_status_check;
alter table public.political_flyers add constraint political_flyers_status_check
  check (status in ('pending_review', 'awaiting_payment', 'approved', 'rejected', 'paused'));
alter table public.political_flyers
  add column payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'refunded')),
  add column stripe_checkout_session_id text unique,
  add column stripe_payment_intent_id text unique,
  add column paid_at timestamptz;

create or replace function public.validate_political_flyer_approval()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status in ('awaiting_payment', 'approved') then
    if new.election_date < current_date or not exists (
      select 1 from public.verification_requests v
      where v.user_id = new.owner_id and v.status = 'verified'
        and v.verification_type in ('candidate', 'official')
        and (v.expires_at is null or v.expires_at > now())
        and (v.election_date is null or v.election_date >= current_date)
        and (new.target_state <> 'CA' or
          (v.filing_id is not null and v.filing_id = new.committee_id))
    ) then
      raise exception 'Candidate/official and campaign ID must be verified before review approval';
    end if;
    if new.reviewed_at is null then
      raise exception 'A reviewer must set reviewed_at before payment';
    end if;
  end if;
  if new.status = 'approved' and
    (new.payment_status <> 'paid' or new.paid_at is null or new.stripe_checkout_session_id is null) then
    raise exception 'Verified Stripe payment is required before publication';
  end if;
  return new;
end;
$$;

drop policy "Public can see current approved flyers" on public.political_flyers;
create policy "Public can see paid approved flyers" on public.political_flyers
  for select to anon, authenticated
  using (status = 'approved' and payment_status = 'paid'
    and reviewed_at is not null and election_date >= current_date);
