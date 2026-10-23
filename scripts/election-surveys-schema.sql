-- Four neutral, voluntary 2026 election surveys. Individual responses are private.
create schema if not exists survey_private;
revoke all on schema survey_private from public;
grant usage on schema survey_private to anon, authenticated;
create table survey_private.surveys (
 id text primary key, title text not null, state_code text not null check(state_code in ('TX','OH')),
 office text not null check(office in ('governor','senate')), source_url text not null,
 write_in_source_url text not null, closes_at timestamptz not null default '2026-11-04 08:00:00+00',
 sort_order integer not null
);
create table survey_private.choices (
 survey_id text not null references survey_private.surveys(id), id text not null,
 name text not null, party text not null, write_in boolean not null default false,
 sort_order integer not null, primary key(survey_id,id)
);
create table survey_private.responses (
 survey_id text not null, user_id uuid not null references auth.users(id) on delete cascade,
 choice_id text not null, updated_at timestamptz not null default now(),
 primary key(survey_id,user_id),
 foreign key(survey_id,choice_id) references survey_private.choices(survey_id,id)
);
create index election_survey_response_choice on survey_private.responses(survey_id,choice_id);
alter table survey_private.surveys enable row level security;
alter table survey_private.choices enable row level security;
alter table survey_private.responses enable row level security;
revoke all on all tables in schema survey_private from public,anon,authenticated;

-- Intentionally public aggregate totals; never returns another person's response or identity.
create function survey_private.read_surveys() returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(item order by position),'[]'::jsonb) from (
 select s.sort_order position, jsonb_build_object(
  'id',s.id,'title',s.title,'state_code',s.state_code,'office',s.office,
  'source_url',s.source_url,'write_in_source_url',s.write_in_source_url,
  'open',now()<s.closes_at,
  'own_choice',(select r.choice_id from survey_private.responses r where r.survey_id=s.id and r.user_id=auth.uid()),
  'total',(select count(*) from survey_private.responses r where r.survey_id=s.id),
  'choices',(select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'party',c.party,'write_in',c.write_in,
   'count',(select count(*) from survey_private.responses r where r.survey_id=c.survey_id and r.choice_id=c.id)) order by c.sort_order)
   from survey_private.choices c where c.survey_id=s.id)
 ) item from survey_private.surveys s) data;
$$;
create function survey_private.save_response(p_survey text,p_choice text) returns void
language plpgsql security definer set search_path = '' as $$
declare viewer uuid := auth.uid();
begin
 if viewer is null or not exists(select 1 from auth.users u where u.id=viewer and u.email_confirmed_at is not null
   and coalesce(u.is_anonymous,false)=false and (u.banned_until is null or u.banned_until<now())) then
  raise exception 'Sign in with a confirmed email to answer this survey.' using errcode='42501';
 end if;
 if not exists(select 1 from survey_private.surveys s where s.id=p_survey and now()<s.closes_at) then
  raise exception 'This survey is closed or unavailable.' using errcode='22023';
 end if;
 if not exists(select 1 from survey_private.choices c where c.survey_id=p_survey and c.id=p_choice) then
  raise exception 'Choose an option from this survey.' using errcode='22023';
 end if;
 insert into survey_private.responses(survey_id,user_id,choice_id) values(p_survey,viewer,p_choice)
 on conflict(survey_id,user_id) do update set choice_id=excluded.choice_id,updated_at=now();
end $$;
revoke all on function survey_private.read_surveys() from public;
revoke all on function survey_private.save_response(text,text) from public,anon;
grant execute on function survey_private.read_surveys() to anon,authenticated;
grant execute on function survey_private.save_response(text,text) to authenticated;
create function public.get_election_surveys() returns jsonb language sql stable security invoker set search_path=''
 as $$select survey_private.read_surveys();$$;
create function public.answer_election_survey(p_survey text,p_choice text) returns void language sql security invoker set search_path=''
 as $$select survey_private.save_response(p_survey,p_choice);$$;
revoke all on function public.get_election_surveys() from public;
revoke all on function public.answer_election_survey(text,text) from public,anon;
grant execute on function public.get_election_surveys() to anon,authenticated;
grant execute on function public.answer_election_survey(text,text) to authenticated;
