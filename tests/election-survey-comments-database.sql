begin;
insert into auth.users(id,email,email_confirmed_at) values('d1111111-1111-4111-8111-111111111111','survey-comment-test@example.invalid',now());
select set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
select public.answer_election_survey('tx-governor-2026','undecided');
select set_config('test.survey_comment_id',(public.prepare_election_survey_comment('tx-governor-2026','Please explain your plan for road repairs.')->>'id'),true);
do $$begin
 if exists(select 1 from jsonb_array_elements(public.get_election_surveys()) x where jsonb_array_length(x->'comments')>0) then raise exception 'Pending comment is public';end if;
 begin
 perform public.finish_election_survey_comment(current_setting('test.survey_comment_id')::uuid,true,'forged_approval');
 raise exception using errcode='XX000',message='Browser forged approval';exception when insufficient_privilege then null;end;
 begin
 perform 1 from survey_private.comments;
 raise exception using errcode='XX000',message='Browser reads raw comments';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
select public.finish_election_survey_comment(current_setting('test.survey_comment_id')::uuid,true,'test_approved');
reset role;
set local role authenticated;
do $$declare result jsonb;begin
 select x into result from jsonb_array_elements(public.get_election_surveys()) x where x->>'id'='tx-governor-2026';
 if jsonb_array_length(result->'comments')<>1 then raise exception 'Approved comment missing';end if;
 if result::text like '%user_id%' then raise exception 'Author ID disclosed';end if;
 if public.prepare_election_survey_comment('tx-governor-2026','Please explain your plan for road repairs.')->>'status'<>'approved' then raise exception 'Duplicate post not recognized';end if;
 if public.prepare_election_survey_comment('tx-governor-2026','This is bullshit.')->>'status'<>'rejected' then raise exception 'Profanity accepted';end if;
 begin
 perform public.prepare_election_survey_comment('oh-governor-2026','Unsaved choice fixture');
 raise exception using errcode='XX000',message='Comment accepted before choice';exception when invalid_parameter_value then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$declare result jsonb;begin
 select x into result from jsonb_array_elements(public.get_election_surveys()) x where x->>'id'='tx-governor-2026';
 if jsonb_array_length(result->'comments')<>1 or result->>'own_choice' is not null then raise exception 'Public comment/choice privacy failed';end if;
 begin
 perform public.prepare_election_survey_comment('tx-governor-2026','anonymous fixture');
 raise exception using errcode='XX000',message='Anonymous comment accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: pending/rejected private, service-only approval, profanity rejection, duplicate prevention, saved-choice gate, anonymous denial' result;
