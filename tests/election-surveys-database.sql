begin;
insert into auth.users(id,email,email_confirmed_at) values
('c1111111-1111-4111-8111-111111111111','survey-test@example.invalid',now());
set local role anon;
do $$declare data jsonb; begin
 data:=public.get_election_surveys();
 if jsonb_array_length(data)<>4 then raise exception 'Missing surveys';end if;
 if data::text like '%user_id%' then raise exception 'Response identities exposed';end if;
 if exists(select 1 from jsonb_array_elements(data) x where jsonb_array_length(x->'choices')<>8) then raise exception 'Incomplete choices';end if;
 begin
  perform public.answer_election_survey('tx-governor-2026','greg-abbott');
  raise exception using errcode='XX000',message='Anonymous response allowed';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"c1111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
set local role authenticated;
select public.answer_election_survey('tx-governor-2026','greg-abbott');
select public.answer_election_survey('tx-governor-2026','greg-abbott');
select public.answer_election_survey('tx-governor-2026','undecided');
do $$declare data jsonb; begin
 select x into data from jsonb_array_elements(public.get_election_surveys()) x where x->>'id'='tx-governor-2026';
 if data->>'own_choice'<>'undecided' then raise exception 'Update not recorded';end if;
 begin
  perform public.answer_election_survey('tx-governor-2026','jon-husted');
  raise exception using errcode='XX000',message='Candidate from another race accepted';
 exception when invalid_parameter_value then null;end;
 begin
  perform 1 from survey_private.responses;
  raise exception using errcode='XX000',message='Raw responses visible';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if (select count(*) from survey_private.responses where user_id='c1111111-1111-4111-8111-111111111111')<>1 then raise exception 'Duplicate response counted';end if;
end $$;
select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$declare data jsonb;begin
 if exists(select 1 from jsonb_array_elements(public.get_election_surveys()) x where x->>'own_choice' is not null) then raise exception 'Anonymous caller sees selection';end if;
end $$;
reset role;
rollback;
select 'PASS: all four races, complete candidate options, anonymous denial, single response, update, cross-race denial, privacy' as result;
