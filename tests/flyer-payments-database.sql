-- Run as a trusted database administrator. All fixtures and state roll back.
-- The approved fixture is never committed or visible outside this transaction.
begin;
insert into auth.users (id,email) values
  ('11111111-1111-4111-8111-111111111111','flyer-payment-audit@example.invalid');
insert into public.verification_requests
  (user_id,verification_type,legal_name,office_title,jurisdiction,authoritative_source_url,
   identity_status,status,reviewed_at,election_date)
values ('11111111-1111-4111-8111-111111111111','candidate','Audit Candidate',
  'Congressional District','Nevada','https://example.invalid/audit','verified','verified',now(),'2099-11-01');
insert into public.flyer_population_areas
  (id,state_code,state_fips,area_type,geo_code,name,population,estimate_year,source_url)
values ('33333333-3333-4333-8333-333333333333','NV','32','congressional','audit-fixture',
  'Payment audit district',700000,2025,'https://example.invalid/audit');
insert into public.political_flyers
  (id,owner_id,headline,body,paid_for_by,target_state,target_scope,election_date)
values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
  'Payment audit fixture','Isolated transactional payment audit.','Audit committee','NV','state','2099-11-01');

update public.political_flyers set status='awaiting_payment',reviewed_at=now(),
  fee_geography_id='33333333-3333-4333-8333-333333333333',stripe_checkout_session_id='cs_transactional_audit'
where id='22222222-2222-4222-8222-222222222222';
do $$ begin
  if not exists (select 1 from public.political_flyers where id='22222222-2222-4222-8222-222222222222'
    and fee_amount_cents=49500 and fee_population=700000 and payment_status='unpaid') then
    raise exception 'Reviewed congressional fee must be exactly 49500 cents';
  end if;
  begin
    update public.political_flyers set status='approved' where id='22222222-2222-4222-8222-222222222222';
    raise exception using errcode='XX000',message='Unpaid publication unexpectedly allowed';
  exception when raise_exception then null; end;
  begin
    update public.political_flyers set fee_amount_cents=14900 where id='22222222-2222-4222-8222-222222222222';
    raise exception using errcode='XX000',message='Reviewed fee unexpectedly mutable';
  exception when raise_exception then null; end;
end $$;

set local role anon;
do $$ begin
  if exists (select 1 from public.political_flyers where id='22222222-2222-4222-8222-222222222222') then
    raise exception 'Public can see unpaid flyer';
  end if;
end $$;
reset role;
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;
do $$ declare changed integer; begin
  begin
    update public.political_flyers set payment_status='paid',status='approved',paid_at=now()
      where id='22222222-2222-4222-8222-222222222222';
    get diagnostics changed=row_count;
    if changed<>0 then raise exception 'Owner can forge a payment'; end if;
  exception when insufficient_privilege then null; end;
end $$;
reset role;

update public.political_flyers set payment_status='paid',status='approved',paid_at=now(),
  stripe_payment_intent_id='pi_transactional_audit'
where id='22222222-2222-4222-8222-222222222222' and stripe_checkout_session_id='cs_transactional_audit'
  and owner_id='11111111-1111-4111-8111-111111111111' and status='awaiting_payment' and payment_status='unpaid';
do $$ declare changed integer; begin
  update public.political_flyers set payment_status='paid',status='approved',paid_at=now()
    where id='22222222-2222-4222-8222-222222222222' and status='awaiting_payment' and payment_status='unpaid';
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Duplicate payment changed flyer'; end if;
end $$;
set local role anon;
do $$ begin
  if not exists (select 1 from public.political_flyers where id='22222222-2222-4222-8222-222222222222') then
    raise exception 'Paid approved flyer is not visible';
  end if;
end $$;
reset role;
update public.political_flyers set payment_status='refunded',status='paused'
where stripe_payment_intent_id='pi_transactional_audit' and payment_status='paid';
set local role anon;
do $$ begin
  if exists (select 1 from public.political_flyers where id='22222222-2222-4222-8222-222222222222') then
    raise exception 'Refunded flyer still public';
  end if;
end $$;
reset role;
rollback;
select 'PASS: fee, review guard, owner denial, public visibility, idempotency, refund; all fixtures rolled back' as audit_result;
