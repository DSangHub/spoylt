-- Census population reference data is imported by a trusted service role.
-- No browser role may edit prices or population records.
create table public.flyer_population_areas (
  id uuid primary key default gen_random_uuid(),
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  state_fips text not null check (state_fips ~ '^[0-9]{2}$'),
  area_type text not null check (area_type in (
    'county', 'congressional', 'state_senate', 'state_house',
    'school_elementary', 'school_secondary', 'school_unified', 'local_district')),
  geo_code text not null,
  name text not null,
  population integer not null check (population > 0),
  estimate_year integer not null check (estimate_year between 2020 and 2100),
  source_url text not null check (source_url ~ '^https://'),
  imported_at timestamptz not null default now(),
  unique (state_fips, area_type, geo_code, estimate_year)
);
create index flyer_population_state_idx on public.flyer_population_areas (state_code, area_type, name);
alter table public.flyer_population_areas enable row level security;
grant select on public.flyer_population_areas to anon, authenticated;
create policy "Population reference is public" on public.flyer_population_areas
  for select to anon, authenticated using (true);

alter table public.political_flyers
  add column fee_geography_id uuid references public.flyer_population_areas(id),
  add column fee_population integer check (fee_population > 0),
  add column fee_population_year integer;

-- Fires before the existing fee guard. A reviewer links the verified office's
-- actual constituency to a source area while the flyer is pending review.
create function public.assign_population_flyer_fee()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare area public.flyer_population_areas%rowtype;
begin
  if tg_op = 'UPDATE' and old.status <> 'pending_review' and
    (new.fee_geography_id is distinct from old.fee_geography_id or
     new.fee_population is distinct from old.fee_population or
     new.fee_population_year is distinct from old.fee_population_year) then
    raise exception 'Flyer population reference is locked after review';
  end if;
  if new.status = 'awaiting_payment' and (tg_op = 'INSERT' or old.status = 'pending_review') then
    if new.fee_geography_id is null then
      raise exception 'Reviewer must select a sourced county or district population';
    end if;
    select * into area from public.flyer_population_areas where id = new.fee_geography_id;
    if not found or area.state_code <> new.target_state then
      raise exception 'Population area must match the flyer state';
    end if;
    -- The reviewer confirms that this population area matches the office sought.
    new.fee_population := area.population;
    new.fee_population_year := area.estimate_year;
    new.fee_amount_cents := case
      when area.area_type = 'congressional' then 49500
      when area.population <= 100000 then 14900
      else 29900
    end;
  end if;
  return new;
end;
$$;
create trigger a_assign_population_flyer_fee before insert or update on public.political_flyers
  for each row execute function public.assign_population_flyer_fee();
