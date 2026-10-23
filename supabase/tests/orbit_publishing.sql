-- Fictional accounts and all writes are rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('60000000-0000-4000-8000-000000000001','publish-a@example.invalid','{"name":"Publishing Alice"}'),
 ('60000000-0000-4000-8000-000000000002','publish-b@example.invalid','{"name":"Publishing Bob"}'),
 ('60000000-0000-4000-8000-000000000003','publish-c@example.invalid','{"name":"Publishing Carol"}');
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.orbit_mutate('{"type":"create_post","body":"Workspace only","category":"general"}');
select public.orbit_mutate('{"type":"create_post","body":"Shared profile post","category":"general","shareOnProfile":true}');
select set_config('orbit.test.shared_post',(select id::text from public.orbit_posts where body='Shared profile post'),true);
select set_config('orbit.test.private_post',(select id::text from public.orbit_posts where body='Workspace only'),true);
select public.orbit_mutate(jsonb_build_object('type','add_comment','id',current_setting('orbit.test.shared_post'),'body','Private workspace comment'));
select public.orbit_mutate(jsonb_build_object('type','toggle_like','id',current_setting('orbit.test.shared_post')));
select public.orbit_club_create('60000000-0000-4000-8000-000000000010','Publishing Club','Test publishing','Other','','violet');
select public.orbit_club_post('60000000-0000-4000-8000-000000000010','60000000-0000-4000-8000-000000000020',repeat('x',3000));
select public.orbit_club_post('60000000-0000-4000-8000-000000000010','60000000-0000-4000-8000-000000000020',repeat('x',3000));
select public.orbit_club_send('60000000-0000-4000-8000-000000000010','60000000-0000-4000-8000-000000000021','Separate chat');
select set_config('orbit.test.event_action',jsonb_build_object('type','create_club_event','id','60000000-0000-4000-8000-000000000030',
 'clubId','60000000-0000-4000-8000-000000000010','title','Club study session','description','Bring notes','location','Library',
 'startsAt',now()+interval '7 days','cover','green')::text,true);
select public.orbit_mutate(current_setting('orbit.test.event_action')::jsonb);
select public.orbit_mutate(current_setting('orbit.test.event_action')::jsonb);
do $$ declare v jsonb; begin
  if (select count(*) from public.orbit_events where id='60000000-0000-4000-8000-000000000030')<>1 then raise exception 'Club event retry duplicated'; end if;
  v:=public.orbit_club_posts('60000000-0000-4000-8000-000000000010');
  if jsonb_array_length(v->'messages')<>1 or char_length(v->'messages'->0->>'body')<>3000 then raise exception 'Club post retry or length failed'; end if;
  if jsonb_array_length(public.orbit_club_messages('60000000-0000-4000-8000-000000000010')->'messages')<>1 then raise exception 'Post leaked into chat'; end if;
  begin perform public.orbit_club_send('60000000-0000-4000-8000-000000000010','60000000-0000-4000-8000-000000000020',repeat('x',2000));
    raise exception 'Retry changed kind'; exception when invalid_parameter_value then null; end;
  begin perform public.orbit_club_posts('60000000-0000-4000-8000-000000000010','60000000-0000-4000-8000-000000000021');
    raise exception 'Cross-stream cursor accepted'; exception when no_data_found then null; end;
  begin perform public.orbit_club_post('60000000-0000-4000-8000-000000000010',gen_random_uuid(),repeat('x',3001));
    raise exception 'Oversized club post accepted'; exception when invalid_parameter_value then null; end;
  begin perform orbit_private.workspace_mutate('{"type":"create_post","body":"bypass","category":"general"}');
    raise exception 'Private workspace mutation callable'; exception when insufficient_privilege then null; end;
  begin perform orbit_private.workspace_data(); raise exception 'Internal workspace snapshot callable'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
do $$ declare v jsonb; p jsonb; begin
  v:=public.orbit_profile_page('60000000-0000-4000-8000-000000000001'); p:=v->'posts'->0;
  if jsonb_array_length(v->'posts')<>1 or p->>'body'<>'Shared profile post' or p->>'likeCount'<>'1' or p->>'commentCount'<>'1' then raise exception 'Cross-workspace shared post missing'; end if;
  if (select count(*) from jsonb_object_keys(p))<>6 or p::text like '%Private workspace comment%'
    or (v->'profile') ?| array['email','residenceHall','visibility','housingStatus'] then raise exception 'Profile page exposed private data'; end if;
  if exists(select 1 from public.orbit_posts) then raise exception 'Sharing exposed raw workspace posts'; end if;
  begin perform public.orbit_mutate(jsonb_build_object('type','set_post_sharing','id',current_setting('orbit.test.shared_post'),'shared',false));
    raise exception 'Non-author changed sharing'; exception when insufficient_privilege then null; end;
  begin perform public.orbit_profile_page('60000000-0000-4000-8000-000000000001',current_setting('orbit.test.private_post')::uuid);
    raise exception 'Private post cursor accepted'; exception when no_data_found then null; end;
  begin perform public.orbit_club_posts('60000000-0000-4000-8000-000000000010'); raise exception 'Nonfollower read posts'; exception when insufficient_privilege then null; end;
  begin perform public.orbit_club_post('60000000-0000-4000-8000-000000000010',gen_random_uuid(),'Nonfollower'); raise exception 'Nonfollower published'; exception when insufficient_privilege then null; end;
  if exists(select 1 from jsonb_array_elements(public.orbit_get_data()->'events') x where x->>'id'='60000000-0000-4000-8000-000000000030') then raise exception 'Nonfollower saw club event'; end if;
end; $$;
select public.orbit_club_follow('60000000-0000-4000-8000-000000000010',true);
select public.orbit_club_post('60000000-0000-4000-8000-000000000010',gen_random_uuid(),'Follower post');
do $$ declare v jsonb; begin
  if jsonb_array_length(public.orbit_club_posts('60000000-0000-4000-8000-000000000010')->'messages')<>2 then raise exception 'Follower post not readable'; end if;
  begin perform public.orbit_mutate(current_setting('orbit.test.event_action')::jsonb || jsonb_build_object('id',gen_random_uuid()));
    raise exception 'Follower created owner event'; exception when insufficient_privilege then null; end;
  select x into v from jsonb_array_elements(public.orbit_get_data()->'events') x where x->>'id'='60000000-0000-4000-8000-000000000030';
  if v is null or v->>'clubName'<>'Publishing Club' or v->>'hostName'<>'Publishing Alice' then raise exception 'Followed event missing from plans'; end if;
  begin perform public.orbit_mutate('{"type":"remove_event","id":"60000000-0000-4000-8000-000000000030"}');
    raise exception 'Remove allowed before Not going'; exception when invalid_parameter_value then null; end;
end; $$;
select public.orbit_mutate('{"type":"respond_event","id":"60000000-0000-4000-8000-000000000030","response":"going"}');
select public.orbit_mutate('{"type":"respond_event","id":"60000000-0000-4000-8000-000000000030","response":"going"}');
do $$ declare v jsonb; begin
  select x into v from jsonb_array_elements(public.orbit_get_data()->'events') x where x->>'id'='60000000-0000-4000-8000-000000000030';
  if v->>'response'<>'going' or v->>'attendeeCount'<>'1' then raise exception 'Going not idempotent'; end if;
end; $$;
select public.orbit_mutate('{"type":"respond_event","id":"60000000-0000-4000-8000-000000000030","response":"not_going"}');
select public.orbit_mutate('{"type":"remove_event","id":"60000000-0000-4000-8000-000000000030"}');
do $$ declare v jsonb; begin
  select x into v from jsonb_array_elements(public.orbit_get_data()->'events') x where x->>'id'='60000000-0000-4000-8000-000000000030';
  if not (v->>'removed')::boolean or v->>'response'<>'not_going' or v->>'attendeeCount'<>'0' then raise exception 'Removed choice not durable'; end if;
end; $$;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
do $$ declare v jsonb; begin
  select x into v from jsonb_array_elements(public.orbit_get_data()->'events') x where x->>'id'='60000000-0000-4000-8000-000000000030';
  if (v->>'removed')::boolean or v->>'response' is not null then raise exception 'Other account choice leaked'; end if;
end; $$;
select public.orbit_mutate('{"type":"respond_event","id":"60000000-0000-4000-8000-000000000030","response":"going"}');
select public.orbit_set_profile_visibility('posts',false);
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
do $$ declare v jsonb; begin
  if public.orbit_profile_page('60000000-0000-4000-8000-000000000001')->'posts'<>'null'::jsonb then raise exception 'Master visibility did not hide posts'; end if;
  if exists(select 1 from public.orbit_event_choices where profile_id<>auth.uid()) then raise exception 'Other account response exposed directly'; end if;
  select x into v from jsonb_array_elements(public.orbit_get_data()->'events') x where x->>'id'='60000000-0000-4000-8000-000000000030';
  if v->>'attendeeCount'<>'1' or jsonb_array_length(v->'attendees')<>0 then raise exception 'Club attendee identities exposed'; end if;
end; $$;
select public.orbit_mutate('{"type":"restore_event","id":"60000000-0000-4000-8000-000000000030"}');
do $$ declare v jsonb; begin
  select x into v from jsonb_array_elements(public.orbit_get_data()->'events') x where x->>'id'='60000000-0000-4000-8000-000000000030';
  if (v->>'removed')::boolean or v->>'response'<>'not_going' then raise exception 'Restore changed response'; end if;
end; $$;
select public.orbit_club_follow('60000000-0000-4000-8000-000000000010',false);
do $$ begin
  if exists(select 1 from jsonb_array_elements(public.orbit_get_data()->'events') x where x->>'id'='60000000-0000-4000-8000-000000000030') then raise exception 'Unfollow retained event'; end if;
  begin perform public.orbit_club_posts('60000000-0000-4000-8000-000000000010'); raise exception 'Unfollow retained posts'; exception when insufficient_privilege then null; end;
  begin perform public.orbit_mutate('{"type":"respond_event","id":"60000000-0000-4000-8000-000000000030","response":"going"}'); raise exception 'Unfollow retained event response access'; exception when no_data_found then null; end;
end; $$;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
select public.orbit_set_profile_visibility('posts',true);
select public.orbit_mutate(jsonb_build_object('type','set_post_sharing','id',current_setting('orbit.test.shared_post'),'shared',false));
do $$ begin
  if jsonb_array_length(public.orbit_profile_page(auth.uid())->'posts')<>0 then raise exception 'Post sharing switch failed'; end if;
end; $$;
reset role;
-- A reused workspace event ID must never become a successful club event request.
insert into public.orbit_events(id,workspace_id,host_id,title,description,location,starts_at,category,cover)
values('60000000-0000-4000-8000-000000000032',
 (select workspace_id from public.orbit_memberships where profile_id='60000000-0000-4000-8000-000000000001' limit 1),
 '60000000-0000-4000-8000-000000000001','Club study session','Bring notes','Library',now()+interval '7 days','Clubs','green');
set local role authenticated;
do $$ begin
  begin perform public.orbit_mutate(current_setting('orbit.test.event_action')::jsonb || '{"id":"60000000-0000-4000-8000-000000000032"}'::jsonb);
    raise exception 'Workspace event ID accepted for a club event'; exception when invalid_parameter_value then null; end;
end; $$;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
do $$ begin
  begin perform public.orbit_mutate('{"type":"respond_event","id":"60000000-0000-4000-8000-000000000032","response":"going"}');
    raise exception 'Another workspace event response allowed'; exception when no_data_found then null; end;
end; $$;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
reset role;
-- Exercise bounded pagination and posting limits without creating test notifications.
insert into public.orbit_posts(workspace_id,author_id,body,category,profile_shared,created_at)
select (select workspace_id from public.orbit_memberships where profile_id='60000000-0000-4000-8000-000000000001' limit 1),
 '60000000-0000-4000-8000-000000000001','Page post '||n,'general',true,now()-interval '1 hour' from generate_series(1,23) n;
insert into public.orbit_club_messages(id,club_id,author_id,body,kind)
select gen_random_uuid(), '60000000-0000-4000-8000-000000000010','60000000-0000-4000-8000-000000000001','Rate post '||n,'post' from generate_series(1,9) n;
insert into public.orbit_club_messages(id,club_id,author_id,body,kind,created_at)
select gen_random_uuid(),'60000000-0000-4000-8000-000000000010','60000000-0000-4000-8000-000000000001','Earlier post '||n,'post',now()-interval '2 hours' from generate_series(1,55) n;
set local role authenticated;
do $$ declare a jsonb; b jsonb; begin
  a:=public.orbit_profile_page(auth.uid());
  b:=public.orbit_profile_page(auth.uid(),(a->'posts'->19->>'id')::uuid);
  if jsonb_array_length(a->'posts')<>20 or not (a->>'hasMore')::boolean or jsonb_array_length(b->'posts')<>3 or (b->>'hasMore')::boolean then raise exception 'Profile post paging failed'; end if;
  if exists(select 1 from jsonb_array_elements(a->'posts') x join jsonb_array_elements(b->'posts') y on x->>'id'=y->>'id') then raise exception 'Profile paging duplicated'; end if;
  begin perform public.orbit_club_post('60000000-0000-4000-8000-000000000010',gen_random_uuid(),'Rate limit');
    raise exception 'Club post limit failed' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
  perform public.orbit_club_post('60000000-0000-4000-8000-000000000010','60000000-0000-4000-8000-000000000020',repeat('x',3000));
  a:=public.orbit_club_posts('60000000-0000-4000-8000-000000000010');
  b:=public.orbit_club_posts('60000000-0000-4000-8000-000000000010',(a->'messages'->0->>'id')::uuid);
  if jsonb_array_length(a->'messages')<>50 or not (a->>'hasMore')::boolean or jsonb_array_length(b->'messages')<>16 or (b->>'hasMore')::boolean then raise exception 'Club post pagination failed'; end if;
end; $$;
reset role;
insert into public.orbit_events(id,club_id,host_id,title,description,location,starts_at,category,cover)
select gen_random_uuid(),'60000000-0000-4000-8000-000000000010','60000000-0000-4000-8000-000000000001','Limit fixture '||n,'Test','Library',now()+interval '7 days','Clubs','green' from generate_series(1,19) n;
set local role authenticated;
do $$ begin
  begin perform public.orbit_mutate(current_setting('orbit.test.event_action')::jsonb || jsonb_build_object('id',gen_random_uuid()));
    raise exception 'Club event daily limit failed'; exception when sqlstate 'P0004' then null; end;
  perform public.orbit_mutate(current_setting('orbit.test.event_action')::jsonb);
end; $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin perform public.orbit_profile_page('60000000-0000-4000-8000-000000000001'); raise exception 'Identity missing profile read'; exception when insufficient_privilege then null; end;
end; $$;
set local role anon;
do $$ begin
  begin perform public.orbit_profile_page('60000000-0000-4000-8000-000000000001'); raise exception 'Anonymous profile access'; exception when insufficient_privilege then null; end;
  begin perform public.orbit_club_posts('60000000-0000-4000-8000-000000000010'); raise exception 'Anonymous club posts'; exception when insufficient_privilege then null; end;
  begin perform public.orbit_club_post('60000000-0000-4000-8000-000000000010',gen_random_uuid(),'Anon'); raise exception 'Anonymous club post write'; exception when insufficient_privilege then null; end;
  begin perform public.orbit_mutate('{"type":"remove_event","id":"60000000-0000-4000-8000-000000000030"}'); raise exception 'Anonymous event action'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;

