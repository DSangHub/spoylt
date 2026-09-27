-- A trusted reviewer assigns the fee before moving a flyer to awaiting_payment.
-- Existing flyers have no tier and cannot start a new checkout until reviewed.
alter table public.political_flyers add column fee_amount_cents integer
  check (fee_amount_cents in (14900, 29900, 49500));

create or replace function public.guard_political_flyer_fee()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status in ('awaiting_payment', 'approved') and new.fee_amount_cents is null then
    raise exception 'Reviewer must assign flyer fee before payment';
  end if;
  if tg_op = 'UPDATE' and old.status <> 'pending_review'
    and new.fee_amount_cents is distinct from old.fee_amount_cents then
    raise exception 'Flyer fee cannot change after review';
  end if;
  return new;
end;
$$;

create trigger political_flyer_fee_guard before insert or update on public.political_flyers
  for each row execute function public.guard_political_flyer_fee();
