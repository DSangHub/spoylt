-- Only the moderation service can approve a survey comment; clients can create pending submissions.
create table survey_private.comments (
 id uuid primary key default gen_random_uuid(),
 survey_id text not null references survey_private.surveys(id),
 user_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reason text, policy_version text not null default 'strict-v1',
 created_at timestamptz not null default now(), reviewed_at timestamptz
);
create index survey_comments_user_created on survey_private.comments(user_id,created_at desc);
create index survey_comments_public on survey_private.comments(survey_id,created_at desc) where status='approved';
alter table survey_private.comments enable row level security;
revoke all on survey_private.comments from public,anon,authenticated;
grant usage on schema survey_private to service_role;
create function survey_private.prepare_comment(p_survey text,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); cleaned text:=btrim(p_body); row survey_private.comments; reasons text[];
begin
 if viewer is null or not exists(select 1 from auth.users u where u.id=viewer and u.email_confirmed_at is not null
 and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<now())) then
 raise exception 'Sign in with a confirmed email to comment.' using errcode='42501';end if;
 if cleaned is null or char_length(cleaned) not between 1 and 1000 then
 raise exception 'Comments must be between 1 and 1,000 characters.' using errcode='22023';end if;
 if not exists(select 1 from survey_private.surveys s where s.id=p_survey and now()<s.closes_at) then
 raise exception 'This survey is closed.' using errcode='22023';end if;
 if not exists(select 1 from survey_private.responses r where r.survey_id=p_survey and r.user_id=viewer) then
 raise exception 'Save a candidate selection before commenting.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(viewer::text,0));
 select * into row from survey_private.comments c where c.survey_id=p_survey and c.user_id=viewer and c.body=cleaned
 and c.status='approved' and c.created_at>now()-interval '30 minutes' order by c.created_at desc limit 1;
 if found then return jsonb_build_object('id',row.id,'status','approved');end if;
 if (select count(*) from survey_private.comments c where c.user_id=viewer and c.created_at>now()-interval '1 hour')>=5 then
 raise exception 'Comment limit reached. Please try again later.' using errcode='54000';end if;
 reasons:=private.moderation_reasons(cleaned);
 insert into survey_private.comments(survey_id,user_id,body,status,reason,reviewed_at)
 values(p_survey,viewer,cleaned,case when cardinality(reasons)>0 then 'rejected' else 'pending' end,
 case when cardinality(reasons)>0 then 'community_firewall' end,case when cardinality(reasons)>0 then now() end) returning * into row;
 return jsonb_build_object('id',row.id,'body',row.body,'status',row.status);
end $$;
create function survey_private.finish_comment(p_id uuid,p_allowed boolean,p_reason text) returns text
language plpgsql security definer set search_path='' as $$
declare row survey_private.comments; final_status text;
begin
 select * into row from survey_private.comments c where c.id=p_id for update;
 if not found or row.status<>'pending' then return 'unavailable';end if;
 if row.created_at<now()-interval '2 minutes' then return 'expired';end if;
 final_status:=case when p_allowed is true and cardinality(private.moderation_reasons(row.body))=0
 and exists(select 1 from survey_private.surveys s where s.id=row.survey_id and now()<s.closes_at)
 and exists(select 1 from auth.users u where u.id=row.user_id and u.email_confirmed_at is not null
 and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<now())) then 'approved' else 'rejected' end;
 update survey_private.comments set status=final_status,reason=left(p_reason,100),reviewed_at=now() where id=p_id;
 return final_status;
end $$;
revoke all on function survey_private.prepare_comment(text,text) from public,anon;
revoke all on function survey_private.finish_comment(uuid,boolean,text) from public,anon,authenticated;
grant execute on function survey_private.prepare_comment(text,text) to authenticated;
grant execute on function survey_private.finish_comment(uuid,boolean,text) to service_role;
create function public.prepare_election_survey_comment(p_survey text,p_body text) returns jsonb
language sql security invoker set search_path='' as $$select survey_private.prepare_comment(p_survey,p_body);$$;
create function public.finish_election_survey_comment(p_id uuid,p_allowed boolean,p_reason text) returns text
language sql security invoker set search_path='' as $$select survey_private.finish_comment(p_id,p_allowed,p_reason);$$;
revoke all on function public.prepare_election_survey_comment(text,text) from public,anon;
revoke all on function public.finish_election_survey_comment(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.prepare_election_survey_comment(text,text) to authenticated;
grant execute on function public.finish_election_survey_comment(uuid,boolean,text) to service_role;

create or replace function survey_private.read_surveys() returns jsonb
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
   from survey_private.choices c where c.survey_id=s.id),
  'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'body',c.body,'created_at',c.created_at,'is_own',c.user_id=auth.uid()) order by c.created_at desc)
   from (select c.* from survey_private.comments c where c.survey_id=s.id and c.status='approved' order by c.created_at desc limit 50) c),'[]'::jsonb)
 ) item from survey_private.surveys s) data;
$$;
