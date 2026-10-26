-- Hosted smoke check: existing accounts, fictional rows, complete rollback.
begin;
select set_config('orbit.live.a',(select id::text from public.orbit_profiles order by id limit 1),true);
select set_config('orbit.live.b',(select id::text from public.orbit_profiles order by id offset 1 limit 1),true);
do $$ begin if nullif(current_setting('orbit.live.b'),'') is null then raise exception 'Two existing profiles are needed';end if;end; $$;
select set_config('request.jwt.claim.sub',current_setting('orbit.live.a'),true);
set local role authenticated;
select public.orbit_mutate('{"type":"create_post","id":"b0000000-0000-4000-8000-000000000011","body":"Rollback-only public feed check","audience":"public"}');
select public.orbit_mutate('{"type":"create_post","id":"b0000000-0000-4000-8000-000000000012","body":"Rollback-only follower check","audience":"followers"}');
select public.orbit_mutate('{"type":"create_workspace","name":"Rollback-only social history check"}');
do $$ begin if not exists(select 1 from jsonb_array_elements(public.orbit_profile_page(auth.uid())->'posts') p where p->>'id'='b0000000-0000-4000-8000-000000000012') then raise exception 'History lost after workspace change';end if;end; $$;
select public.orbit_club_create('b0000000-0000-4000-8000-000000000020','Rollback-only Club','Fictional smoke test','Other','','violet');
select public.orbit_mutate(jsonb_build_object('type','create_club_event','id','b0000000-0000-4000-8000-000000000041','clubId','b0000000-0000-4000-8000-000000000020','title','Rollback club event','description','Fictional test','location','Test room','startsAt',now()+interval '1 day','endsAt',now()+interval '1 day 2 hours','cover','green'));
select public.orbit_mutate(jsonb_build_object('type','create_event','id','b0000000-0000-4000-8000-000000000042','title','Rollback campus event','description','Fictional test','location','Test room','startsAt',now()+interval '1 day','endsAt',now()+interval '1 day 2 hours','cover','blue','category','Social'));
select public.orbit_mutate(jsonb_build_object('type','edit_event_schedule','id','b0000000-0000-4000-8000-000000000042','startsAt',now()-interval '30 minutes','endsAt',now()+interval '30 minutes'));
select set_config('request.jwt.claim.sub',current_setting('orbit.live.b'),true);
-- Unfollow inside this rollback-only transaction so an existing social relation cannot mask a denial.
select public.orbit_profile_social(current_setting('orbit.live.a')::uuid,'stats',false);
do $$ begin
 if orbit_private.can_read_post('b0000000-0000-4000-8000-000000000012',false) or orbit_private.can_read_event('b0000000-0000-4000-8000-000000000041') then raise exception 'Private audience leaked';end if;
 if not orbit_private.can_read_post('b0000000-0000-4000-8000-000000000011',false) or not orbit_private.can_read_event('b0000000-0000-4000-8000-000000000042') then raise exception 'Public content unavailable';end if;
end; $$;
select public.orbit_profile_social(current_setting('orbit.live.a')::uuid,'stats',true);
select public.orbit_club_follow('b0000000-0000-4000-8000-000000000020',true);
select public.orbit_post_respond('b0000000-0000-4000-8000-000000000012',false,'{"type":"comment","id":"b0000000-0000-4000-8000-000000000030","body":"Rollback comment"}');
select public.orbit_mutate('{"type":"respond_event","id":"b0000000-0000-4000-8000-000000000042","response":"going"}');
select public.orbit_mutate('{"type":"respond_event","id":"b0000000-0000-4000-8000-000000000042","response":"not_going"}');
do $$ declare v jsonb;begin
 v:=public.orbit_home_feed();if (select count(*) from jsonb_array_elements(v->'items') i where i->>'id'='b0000000-0000-4000-8000-000000000041')<>1 or exists(select 1 from jsonb_array_elements(v->'items') i where i->>'id'='b0000000-0000-4000-8000-000000000042') then raise exception 'Club/campus feed distinction failed';end if;
end; $$;
select set_config('request.jwt.claim.sub',current_setting('orbit.live.a'),true);
select public.orbit_mutate(jsonb_build_object('type','edit_event_schedule','id','b0000000-0000-4000-8000-000000000042','startsAt',now()-interval '30 minutes','endsAt',now()-interval '5 minutes'));
select set_config('request.jwt.claim.sub',current_setting('orbit.live.b'),true);
do $$ declare state text;begin foreach state in array array['going','not_going'] loop
 begin perform public.orbit_mutate(jsonb_build_object('type','respond_event','id','b0000000-0000-4000-8000-000000000042','response',state));raise exception 'Ended RSVP accepted';exception when sqlstate 'P0006' then null;end;
 end loop;end; $$;
rollback;
select 'Global feed and event checks passed; all changes rolled back' as result,
 (select count(*) from public.orbit_posts where id::text like 'b0000000-%') as retained_test_posts,
 (select count(*) from public.orbit_events where id::text like 'b0000000-%') as retained_test_events;
