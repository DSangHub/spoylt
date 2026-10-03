begin;
create table public.proposition_flyers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 proposition_number text not null check (length(btrim(proposition_number)) between 1 and 30),
 yes_reason text not null check (length(btrim(yes_reason)) between 1 and 1200),
 legal_information text not null check (length(btrim(legal_information)) between 1 and 800),
 target_state text not null default 'CA' check (target_state = 'CA'),
 weekly_price_cents integer not null default 79500 check (weekly_price_cents = 79500),
 display_option text not null default 'one_week' check (display_option in ('one_week','weekly_subscription')),
 status text not null default 'pending_review' check (status in ('pending_review','awaiting_payment','approved','rejected','paused')),
 payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
 display_starts_at timestamptz,
 display_expires_at timestamptz,
 created_at timestamptz not null default now(),
 check (display_expires_at is null or (display_starts_at is not null and display_expires_at > display_starts_at and display_expires_at <= display_starts_at + interval '7 days' and display_expires_at <= timestamptz '2026-11-03 08:00:00+00')),
 check (status <> 'approved' or (payment_status = 'paid' and display_starts_at is not null and display_expires_at is not null))
);
alter table public.proposition_flyers enable row level security;
revoke all on public.proposition_flyers from public, anon, authenticated;
grant select on public.proposition_flyers to anon, authenticated;
grant insert (proposition_number, yes_reason, legal_information, display_option) on public.proposition_flyers to authenticated;
grant all on public.proposition_flyers to service_role;
create policy proposition_flyers_owner_read on public.proposition_flyers for select to authenticated using ((select auth.uid()) = owner_id);
create policy proposition_flyers_public_read on public.proposition_flyers for select to anon, authenticated using (
 status = 'approved' and payment_status = 'paid' and target_state = 'CA'
 and display_starts_at <= now() and display_expires_at > now());
create policy proposition_flyers_private_submit on public.proposition_flyers for insert to authenticated with check (
 (select auth.uid()) = owner_id and status = 'pending_review' and payment_status = 'unpaid'
 and display_starts_at is null and display_expires_at is null and weekly_price_cents = 79500 and target_state = 'CA'
 and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true');
create index proposition_flyers_owner on public.proposition_flyers(owner_id);
create index proposition_flyers_active on public.proposition_flyers(display_expires_at) where status='approved' and payment_status='paid';
commit;