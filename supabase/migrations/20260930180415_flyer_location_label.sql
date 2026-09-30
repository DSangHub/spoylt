alter table public.political_flyers add column location_label text check (char_length(trim(location_label)) between 1 and 100);
comment on column public.political_flyers.location_label is 'Candidate-supplied ZIP or location displayed on the flyer; reviewed target geography remains authoritative for placement and fees.';
