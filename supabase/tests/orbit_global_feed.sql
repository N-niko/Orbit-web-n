-- Fictional data only; every write is rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('a0000000-0000-4000-8000-000000000001','feed-a@example.invalid','{"name":"Feed Alice"}'),
 ('a0000000-0000-4000-8000-000000000002','feed-b@example.invalid','{"name":"Feed Bob"}'),
 ('a0000000-0000-4000-8000-000000000003','feed-c@example.invalid','{"name":"Feed Carol"}');
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select public.orbit_get_data();
update public.orbit_profiles set visibility=jsonb_set(visibility,'{posts}','false') where id=auth.uid();
insert into public.orbit_posts(id,workspace_id,author_id,body,category) select 'a0000000-0000-4000-8000-000000000010',current_workspace_id,id,'Historical private post','general' from public.orbit_profiles where id=auth.uid();
insert into public.orbit_events(id,workspace_id,host_id,title,location,starts_at,category,cover)
 select 'a0000000-0000-4000-8000-000000000040',current_workspace_id,id,'Historical private event','Room',now()+interval '1 day','Social','blue' from public.orbit_profiles where id=auth.uid();
select set_config('orbit.test.other_workspace',(select w.invite_code from public.orbit_workspaces w join public.orbit_profiles p on p.current_workspace_id=w.id where p.id='a0000000-0000-4000-8000-000000000002'),true);
set local role authenticated;
select public.orbit_mutate('{"type":"create_post","id":"a0000000-0000-4000-8000-000000000011","body":"Global public","audience":"public"}');
select public.orbit_mutate('{"type":"create_post","id":"a0000000-0000-4000-8000-000000000012","body":"Followers only","audience":"followers"}');
select public.orbit_mutate('{"type":"create_post","id":"a0000000-0000-4000-8000-000000000011","body":"Global public","audience":"public"}');
select public.orbit_file_reserve('a0000000-0000-4000-8000-000000000013','notes.pdf','application/pdf',12);
reset role;
insert into storage.objects(bucket_id,name,metadata) values('orbit-post-files','a0000000-0000-4000-8000-000000000001/a0000000-0000-4000-8000-000000000013','{"size":12,"mimetype":"application/pdf"}');
set local role authenticated;
select public.orbit_mutate('{"type":"create_post","id":"a0000000-0000-4000-8000-000000000014","body":"Private file","audience":"followers","attachmentIds":["a0000000-0000-4000-8000-000000000013"]}');
select public.orbit_mutate('{"type":"create_workspace","name":"A different space"}');
select public.orbit_mutate(jsonb_build_object('type','join_workspace','code',current_setting('orbit.test.other_workspace')));
do $$ declare v jsonb; begin
 v:=public.orbit_profile_page(auth.uid());
 if jsonb_array_length(v->'posts')<>4 then raise exception 'Workspace switch lost author history'; end if;
 if not exists(select 1 from jsonb_array_elements(public.orbit_home_feed()->'items') i where i->>'id'='a0000000-0000-4000-8000-000000000010') then raise exception 'Own legacy post missing after switch'; end if;
 if exists(select 1 from public.orbit_posts where audience<>'legacy' and workspace_id is not null) then raise exception 'New post tied to workspace'; end if;
 if jsonb_array_length(public.orbit_get_data()->'posts')<>0 then raise exception 'Workspace snapshot still embeds post history'; end if;
 begin perform public.orbit_mutate('{"type":"create_post","body":"Invalid audience","audience":"legacy"}');raise exception 'Legacy audience accepted';exception when invalid_parameter_value then null;end;
 begin perform public.orbit_mutate('{"type":"create_post","id":"a0000000-0000-4000-8000-000000000011","body":"Global public","audience":"followers"}');raise exception 'Retry changed audience';exception when invalid_parameter_value then null;end;
 begin perform orbit_private.validated_publish_post(gen_random_uuid(),'Bypass','general',array[]::uuid[],null);raise exception 'Old publisher exposed';exception when insufficient_privilege then null;end;
end; $$;
select public.orbit_club_create('a0000000-0000-4000-8000-000000000020','Feed Club','Fictional testing','Other','','violet');
select public.orbit_mutate(jsonb_build_object('type','create_club_event','id','a0000000-0000-4000-8000-000000000041','clubId','a0000000-0000-4000-8000-000000000020','title','Club overnight','description','Bring notes','location','Library','startsAt',now()+interval '1 day','endsAt',now()+interval '1 day 3 hours','cover','green'));
select public.orbit_mutate(jsonb_build_object('type','create_event','id','a0000000-0000-4000-8000-000000000042','title','Campus plan','description','Campus-wide','location','Quad','startsAt',now()+interval '2 days','endsAt',now()+interval '2 days 2 hours','category','Social','cover','blue'));
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
do $$ declare v jsonb; begin
 if not orbit_private.can_read_post('a0000000-0000-4000-8000-000000000011',false) or orbit_private.can_read_post('a0000000-0000-4000-8000-000000000012',false) or orbit_private.can_read_post('a0000000-0000-4000-8000-000000000010',false) then raise exception 'Audience access mismatch'; end if;
 v:=public.orbit_profile_page('a0000000-0000-4000-8000-000000000001');if jsonb_array_length(v->'posts')<>1 then raise exception 'Profile bypasses audience/master setting';end if;
 if exists(select 1 from public.orbit_posts where id in ('a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000010')) or exists(select 1 from public.orbit_comments where post_id='a0000000-0000-4000-8000-000000000012') then raise exception 'Raw private rows leaked';end if;
 begin perform public.orbit_post_thread('a0000000-0000-4000-8000-000000000012');raise exception 'Private thread leaked';exception when insufficient_privilege then null;end;
 begin perform public.orbit_post_people('a0000000-0000-4000-8000-000000000012');raise exception 'Private likers leaked';exception when insufficient_privilege then null;end;
 begin perform public.orbit_post_respond('a0000000-0000-4000-8000-000000000012',false,'{"type":"like","liked":true}');raise exception 'Private like accepted';exception when insufficient_privilege then null;end;
 begin perform public.orbit_file_info('a0000000-0000-4000-8000-000000000013');raise exception 'Private file leaked';exception when no_data_found then null;end;
 if exists(select 1 from storage.objects where name like '%000000000013') then raise exception 'Storage bypassed audience';end if;
 if not exists(select 1 from jsonb_array_elements(public.orbit_get_data()->'events') e where e->>'id'='a0000000-0000-4000-8000-000000000042') then raise exception 'Campus event not global';end if;
 if exists(select 1 from jsonb_array_elements(public.orbit_get_data()->'events') e where e->>'id' in ('a0000000-0000-4000-8000-000000000040','a0000000-0000-4000-8000-000000000041')) then raise exception 'Private event exposed';end if;
 if exists(select 1 from jsonb_array_elements(public.orbit_home_feed()->'items') i where i->>'kind'='event') then raise exception 'Campus or private club event leaked into feed';end if;
end; $$;
select public.orbit_profile_social('a0000000-0000-4000-8000-000000000001','stats',true);
select public.orbit_file_info('a0000000-0000-4000-8000-000000000013');
select public.orbit_post_respond('a0000000-0000-4000-8000-000000000012',false,'{"type":"like","liked":true}');
select public.orbit_post_respond('a0000000-0000-4000-8000-000000000012',false,'{"type":"comment","id":"a0000000-0000-4000-8000-000000000030","body":"A root comment"}');
select public.orbit_post_respond('a0000000-0000-4000-8000-000000000012',false,'{"type":"comment","id":"a0000000-0000-4000-8000-000000000031","body":"A nested reply","replyToId":"a0000000-0000-4000-8000-000000000030"}');
select public.orbit_post_respond('a0000000-0000-4000-8000-000000000012',false,'{"type":"comment_like","id":"a0000000-0000-4000-8000-000000000031","liked":true}');
select public.orbit_club_follow('a0000000-0000-4000-8000-000000000020',true);
do $$ declare v jsonb; begin
 if jsonb_array_length(public.orbit_profile_page('a0000000-0000-4000-8000-000000000001')->'posts')<>3 then raise exception 'Follower posts missing';end if;
 if orbit_private.can_read_post('a0000000-0000-4000-8000-000000000010',false) or orbit_private.can_read_event('a0000000-0000-4000-8000-000000000040') then raise exception 'Follow unlocked historical workspace data';end if;
 v:=public.orbit_post_thread('a0000000-0000-4000-8000-000000000012');if v->'comments'->1->>'parentId'<>'a0000000-0000-4000-8000-000000000030' or v->'comments'->1->>'likeCount'<>'1' then raise exception 'Reply/like regression';end if;
 if public.orbit_post_people('a0000000-0000-4000-8000-000000000012')->'users'->0 ?| array['email','residenceHall','bio'] then raise exception 'Liker private fields leaked';end if;
 if (select count(*) from jsonb_array_elements(public.orbit_home_feed()->'items') i where i->>'id'='a0000000-0000-4000-8000-000000000041')<>1 then raise exception 'Club event missing or duplicated';end if;
 v:=public.orbit_get_data();if not exists(select 1 from jsonb_array_elements(v->'events') e where e->>'id'='a0000000-0000-4000-8000-000000000042' and (e->>'followingHost')::boolean) then raise exception 'Following event filter missing';end if;
 begin perform public.orbit_mutate(jsonb_build_object('type','edit_event_schedule','id','a0000000-0000-4000-8000-000000000042','startsAt',now()+interval '3 days','endsAt',now()+interval '3 days 2 hours'));raise exception 'Other student edited event';exception when insufficient_privilege then null;end;
end; $$;
select public.orbit_club_follow('a0000000-0000-4000-8000-000000000020',false);
select public.orbit_profile_social('a0000000-0000-4000-8000-000000000001','stats',false);
do $$ begin
 if orbit_private.can_read_event('a0000000-0000-4000-8000-000000000041') or orbit_private.can_read_post('a0000000-0000-4000-8000-000000000012',false) then raise exception 'Unfollow did not revoke access';end if;
 begin perform public.orbit_post_respond('a0000000-0000-4000-8000-000000000012',false,'{"type":"comment_like","id":"a0000000-0000-4000-8000-000000000031","liked":false}');raise exception 'Unfollow retained comment access';exception when insufficient_privilege then null;end;
end; $$;
reset role;
-- Tie timestamps deliberately. A new publication between pages must not shift or duplicate later pages.
insert into public.orbit_posts(id,author_id,body,category,audience,created_at)
 select ('a0000000-0000-4000-9000-'||lpad(n::text,12,'0'))::uuid,'a0000000-0000-4000-8000-000000000001','Page fixture '||n,'general','public','2026-01-01T00:00:00.123456Z' from generate_series(1,19) n;
insert into public.orbit_events(id,host_id,club_id,audience,title,location,starts_at,ends_at,category,cover,created_at) values
 ('a0000000-0000-4000-9000-000000000014','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000020','club','Tie event','Library',now()+interval '1 day',now()+interval '1 day 2 hours','Clubs','blue','2026-01-01T00:00:00.123456Z');
set local role authenticated;
select public.orbit_club_follow('a0000000-0000-4000-8000-000000000020',true);
do $$ declare v jsonb; c jsonb; ids text[]:=array[]::text[]; item jsonb; pages integer:=0; begin
 loop
  v:=public.orbit_home_feed((c->>'publishedAt')::timestamptz,(c->>'id')::uuid,c->>'kind');
  if jsonb_array_length(v->'items')>8 then raise exception 'Feed page exceeds eight';end if;
  for item in select * from jsonb_array_elements(v->'items') loop
   if (item->>'kind')||':'||(item->>'id')=any(ids) then raise exception 'Duplicate feed item';end if;
   ids:=array_append(ids,(item->>'kind')||':'||(item->>'id'));
   if item->'post'->'author' ?| array['email','bio','residenceHall'] then raise exception 'Feed private identity leaked';end if;
  end loop;
  pages:=pages+1;
  if pages=1 then perform public.orbit_mutate('{"type":"create_post","id":"a0000000-0000-4000-8000-000000000060","body":"New publication between pages","audience":"public"}');end if;
  exit when not (v->>'hasMore')::boolean;c:=v->'nextCursor';
  if pages>10 then raise exception 'Cursor failed to advance';end if;
 end loop;
 if cardinality(ids)<>22 then raise exception 'Feed pagination lost eligible posts: %',cardinality(ids);end if;
 begin perform public.orbit_home_feed(now(),null,null);raise exception 'Partial cursor accepted';exception when invalid_parameter_value then null;end;
end; $$;
reset role;
-- Scheduling: overnight, missing ends, in-progress and exact end boundaries.
do $$ begin
 if orbit_private.event_status('2026-10-26T23:00:00-04:00','2026-10-27T01:00:00-04:00','2026-10-27T04:00:00Z')<>'in_progress' then raise exception 'Overnight timezone status failed';end if;
 if orbit_private.event_status('2026-01-01T10:00:00Z',null,'2026-01-01T11:59:59Z')<>'in_progress' or orbit_private.event_status('2026-01-01T10:00:00Z',null,'2026-01-01T12:00:00Z')<>'past' then raise exception 'Legacy fallback boundary failed';end if;
end; $$;
insert into public.orbit_events(id,host_id,title,location,starts_at,ends_at,category,cover,audience) values
 ('a0000000-0000-4000-8000-000000000043','a0000000-0000-4000-8000-000000000001','Running now','Quad',now()-interval '30 minutes',now()+interval '1 hour','Social','blue','public'),
 ('a0000000-0000-4000-8000-000000000044','a0000000-0000-4000-8000-000000000001','Ended now','Quad',now()-interval '3 hours',now()-interval '1 hour','Social','blue','public'),
 ('a0000000-0000-4000-8000-000000000045','a0000000-0000-4000-8000-000000000001','Legacy running','Quad',now()-interval '1 hour',null,'Social','blue','public');
insert into public.orbit_rsvps values('a0000000-0000-4000-8000-000000000044','a0000000-0000-4000-8000-000000000002');
set local role authenticated;
select public.orbit_mutate('{"type":"respond_event","id":"a0000000-0000-4000-8000-000000000042","response":"going"}');
select public.orbit_mutate('{"type":"respond_event","id":"a0000000-0000-4000-8000-000000000043","response":"going"}');
select public.orbit_mutate('{"type":"respond_event","id":"a0000000-0000-4000-8000-000000000043","response":"not_going"}');
select public.orbit_mutate('{"type":"respond_event","id":"a0000000-0000-4000-8000-000000000045","response":"going"}');
do $$ declare choice text; begin
 foreach choice in array array['going','not_going'] loop
  begin perform public.orbit_mutate(jsonb_build_object('type','respond_event','id','a0000000-0000-4000-8000-000000000044','response',choice));raise exception 'Ended RSVP changed';exception when sqlstate 'P0006' then null;end;
 end loop;
 if not exists(select 1 from public.orbit_rsvps where event_id='a0000000-0000-4000-8000-000000000044' and profile_id=auth.uid()) then raise exception 'Ended selection lost';end if;
end; $$;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select public.orbit_mutate(jsonb_build_object('type','edit_event_schedule','id','a0000000-0000-4000-8000-000000000042','startsAt',now()+interval '3 days','endsAt',now()+interval '3 days 2 hours'));
do $$ begin
 begin perform public.orbit_mutate(jsonb_build_object('type','create_event','title','Bad schedule','description','','location','Quad','startsAt',now()+interval '2 days','endsAt',now()+interval '1 day','category','Social','cover','blue'));raise exception 'Invalid end accepted';exception when invalid_parameter_value then null;end;
 begin perform public.orbit_mutate(jsonb_build_object('type','create_event','title','Missing end','description','','location','Quad','startsAt',now()+interval '2 days','category','Social','cover','blue'));raise exception 'Missing end accepted';exception when invalid_parameter_value then null;end;
end; $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 begin perform public.orbit_home_feed();raise exception 'Anonymous feed exposed';exception when insufficient_privilege then null;end;
 begin perform public.orbit_mutate('{"type":"respond_event"}');raise exception 'Anonymous action accepted';exception when insufficient_privilege then null;end;
end; $$;
rollback;
