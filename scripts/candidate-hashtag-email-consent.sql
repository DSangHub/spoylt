-- Optional, candidate-owned email notification preference, off by default.
begin;
alter table public.candidate_hashtags
  add column email_notifications boolean not null default false,
  add column email_consent_at timestamptz;
grant insert(email_notifications),update(email_notifications) on public.candidate_hashtags to authenticated;
create or replace function private.stamp_candidate_hashtag_email_consent()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.email_notifications then
   if tg_op='INSERT' then new.email_consent_at:=now();
   elsif not old.email_notifications then new.email_consent_at:=now();
   else new.email_consent_at:=old.email_consent_at;
   end if;
 else new.email_consent_at:=null;
 end if;
 return new;
end;
$$;
revoke all on function private.stamp_candidate_hashtag_email_consent() from public,anon,authenticated;
create trigger candidate_hashtag_email_consent before insert or update on public.candidate_hashtags
for each row execute function private.stamp_candidate_hashtag_email_consent();
commit;
