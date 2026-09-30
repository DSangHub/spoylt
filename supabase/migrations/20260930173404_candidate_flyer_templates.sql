-- Preserve previously submitted proportions; new submissions choose a template size.
alter table public.political_flyers
  add column candidate_name text check (char_length(candidate_name) between 2 and 60),
  add column office_title text check (char_length(office_title) between 2 and 60),
  add column district_zone text check (char_length(district_zone) between 1 and 80),
  add column flyer_size text not null default '4x5' check (flyer_size in ('2x4','3x5','4x5')),
  add column design_type text not null default 'template' check (design_type in ('template','upload')),
  add column artwork_path text unique,
  add column requested_fee_amount_cents integer check (requested_fee_amount_cents in (14900,29900,49500)),
  add constraint flyer_artwork_path_check check (
    (design_type = 'template' and artwork_path is null) or
    (design_type = 'upload' and artwork_path is not null and
      artwork_path ~ ('^' || owner_id::text || '/' || id::text || '[.](png|jpg|webp)$')));
alter table public.political_flyers alter column flyer_size set default '2x4';

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('candidate-flyers','candidate-flyers',false,10485760,array['image/png','image/jpeg','image/webp']);

create policy "Verified campaigns upload private flyer artwork" on storage.objects
for insert to authenticated with check (
  bucket_id = 'candidate-flyers' and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](png|jpg|webp)$'
  and exists (select 1 from public.verification_requests v
    where v.user_id = (select auth.uid()) and v.status = 'verified'
      and v.verification_type in ('candidate','official')
      and (v.expires_at is null or v.expires_at > now())
      and (v.election_date is null or v.election_date >= current_date)
      and (v.term_end is null or v.term_end >= current_date)));
create policy "Campaign reads own flyer artwork" on storage.objects for select to authenticated
using (bucket_id = 'candidate-flyers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Public reads paid approved flyer artwork" on storage.objects for select to anon,authenticated
using (bucket_id = 'candidate-flyers' and exists (
  select 1 from public.political_flyers f where f.artwork_path = name
    and f.status = 'approved' and f.payment_status = 'paid' and f.reviewed_at is not null
    and f.election_date >= current_date));
create policy "Campaign cleans up unattached flyer artwork" on storage.objects for delete to authenticated
using (bucket_id = 'candidate-flyers' and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.political_flyers f where f.artwork_path = name));

-- Browser applicants cannot attach another campaign's files, or unuploaded paths.
create function public.validate_flyer_artwork() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.design_type = 'upload' and not exists (
    select 1 from storage.objects o where o.bucket_id = 'candidate-flyers' and o.name = new.artwork_path
  ) then raise exception 'Upload your own flyer artwork before submitting'; end if;
  return new;
end;
$$;
create trigger flyer_artwork_guard before insert or update on public.political_flyers
for each row execute function public.validate_flyer_artwork();
