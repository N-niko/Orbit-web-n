-- Disposable data only. Storage metadata deletes below simulate Storage API results in the local shim.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('c0000000-0000-4000-8000-000000000001','delete-a@example.invalid','{"name":"Delete Alice"}'),
 ('c0000000-0000-4000-8000-000000000002','delete-b@example.invalid','{"name":"Delete Bob"}');
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.orbit_file_reserve('c0000000-0000-4000-8000-000000000011','one.pdf','application/pdf',12);
select public.orbit_file_reserve('c0000000-0000-4000-8000-000000000012','two.pdf','application/pdf',12);
select public.orbit_file_reserve('c0000000-0000-4000-8000-000000000013','keep.pdf','application/pdf',12);
select public.orbit_file_reserve('c0000000-0000-4000-8000-000000000014','club.pdf','application/pdf',12);
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'orbit-post-files','c0000000-0000-4000-8000-000000000001/'||id,'{"size":12,"mimetype":"application/pdf"}' from unnest(array['c0000000-0000-4000-8000-000000000011','c0000000-0000-4000-8000-000000000012','c0000000-0000-4000-8000-000000000013','c0000000-0000-4000-8000-000000000014']) id;
set local role authenticated;
select public.orbit_mutate('{"type":"create_post","id":"c0000000-0000-4000-8000-000000000020","body":"Delete me","audience":"public","attachmentIds":["c0000000-0000-4000-8000-000000000011","c0000000-0000-4000-8000-000000000012"]}');
select public.orbit_mutate('{"type":"create_post","id":"c0000000-0000-4000-8000-000000000021","body":"Keep me","audience":"public","attachmentIds":["c0000000-0000-4000-8000-000000000013"]}');
select public.orbit_post_respond('c0000000-0000-4000-8000-000000000020',false,'{"type":"comment","id":"c0000000-0000-4000-8000-000000000030","body":"Root"}');
select public.orbit_post_respond('c0000000-0000-4000-8000-000000000020',false,'{"type":"comment","id":"c0000000-0000-4000-8000-000000000031","body":"Reply","replyToId":"c0000000-0000-4000-8000-000000000030"}');
select public.orbit_post_respond('c0000000-0000-4000-8000-000000000020',false,'{"type":"like","liked":true}');
select public.orbit_post_respond('c0000000-0000-4000-8000-000000000020',false,'{"type":"comment_like","id":"c0000000-0000-4000-8000-000000000031","liked":true}');
select public.orbit_club_create('c0000000-0000-4000-8000-000000000040','Deletion Club','Fictional test','Other','','violet');
select public.orbit_club_post('c0000000-0000-4000-8000-000000000040','c0000000-0000-4000-8000-000000000041','Keep this unrelated club post');
select public.orbit_club_publish('c0000000-0000-4000-8000-000000000040','c0000000-0000-4000-8000-000000000042','Delete this club post',array['c0000000-0000-4000-8000-000000000014'::uuid]);
select public.orbit_club_send('c0000000-0000-4000-8000-000000000040','c0000000-0000-4000-8000-000000000043','Keep this club chat');
select public.orbit_post_respond('c0000000-0000-4000-8000-000000000042',true,'{"type":"comment","id":"c0000000-0000-4000-8000-000000000044","body":"Club comment"}');
select public.orbit_post_respond('c0000000-0000-4000-8000-000000000042',true,'{"type":"comment_like","id":"c0000000-0000-4000-8000-000000000044","liked":true}');
select public.orbit_mutate(jsonb_build_object('type','create_event','id','c0000000-0000-4000-8000-000000000050','title','Delete campus event','description','Test','location','Quad','startsAt',now()+interval '1 day','endsAt',now()+interval '1 day 2 hours','category','Social','cover','blue'));
select public.orbit_mutate(jsonb_build_object('type','create_club_event','id','c0000000-0000-4000-8000-000000000051','clubId','c0000000-0000-4000-8000-000000000040','title','Delete club event','description','Test','location','Quad','startsAt',now()+interval '1 day','endsAt',now()+interval '1 day 2 hours','cover','blue'));
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-000000000002',true);
select public.orbit_club_follow('c0000000-0000-4000-8000-000000000040',true);
select public.orbit_mutate('{"type":"respond_event","id":"c0000000-0000-4000-8000-000000000050","response":"going"}');
select public.orbit_mutate('{"type":"respond_event","id":"c0000000-0000-4000-8000-000000000051","response":"not_going"}');
do $$ declare action jsonb;begin
 for action in select * from jsonb_array_elements('[{"type":"delete_post","id":"c0000000-0000-4000-8000-000000000020"},{"type":"delete_post","id":"c0000000-0000-4000-8000-000000000042","club":true},{"type":"delete_event","id":"c0000000-0000-4000-8000-000000000050"},{"type":"delete_event","id":"c0000000-0000-4000-8000-000000000051"}]') loop
  begin perform public.orbit_mutate(action);raise exception 'Nonowner deletion accepted';exception when insufficient_privilege then null;end;
 end loop;
 if exists(select 1 from jsonb_array_elements(public.orbit_get_data()->'events') e where e->>'id'='c0000000-0000-4000-8000-000000000051' and (e->>'canDelete')::boolean) then raise exception 'Follower received management rights';end if;
 if jsonb_array_length(public.orbit_post_cleanup_files()->'files')<>0 then raise exception 'Other author cleanup paths exposed';end if;
 begin delete from public.orbit_posts where id='c0000000-0000-4000-8000-000000000020';raise exception 'Direct deletion granted';exception when insufficient_privilege then null;end;
end; $$;
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-000000000001',true);
select public.orbit_mutate('{"type":"create_workspace","name":"Different workspace"}');
select public.orbit_mutate('{"type":"delete_post","id":"c0000000-0000-4000-8000-000000000020"}');
select public.orbit_mutate('{"type":"delete_post","id":"c0000000-0000-4000-8000-000000000020"}');
select public.orbit_mutate('{"type":"delete_event","id":"c0000000-0000-4000-8000-000000000050"}');
select public.orbit_mutate('{"type":"delete_event","id":"c0000000-0000-4000-8000-000000000051"}');
select public.orbit_mutate('{"type":"delete_event","id":"c0000000-0000-4000-8000-000000000051"}');
select public.orbit_mutate('{"type":"delete_post","id":"c0000000-0000-4000-8000-000000000042","club":true}');
do $$ declare v jsonb;begin
 if jsonb_array_length(public.orbit_post_cleanup_files()->'files')<>3 or not (public.orbit_get_data()->>'postFileCleanupPending')::boolean then raise exception 'Durable file cleanup missing';end if;
 if not (public.orbit_post_cleanup_done(array['c0000000-0000-4000-8000-000000000011'::uuid,'c0000000-0000-4000-8000-000000000012'::uuid])->>'pending')::boolean then raise exception 'Acknowledged binaries before removal';end if;
 begin perform public.orbit_file_reserve('c0000000-0000-4000-8000-000000000011','one.pdf','application/pdf',12);raise exception 'Queued path reused';exception when invalid_parameter_value then null;end;
 begin perform public.orbit_file_info('c0000000-0000-4000-8000-000000000011');raise exception 'Deleted attachment still accessible';exception when no_data_found then null;end;
 begin perform public.orbit_post_thread('c0000000-0000-4000-8000-000000000020');raise exception 'Deleted post still accessible';exception when insufficient_privilege then null;end;
 if exists(select 1 from jsonb_array_elements(public.orbit_home_feed()->'items') i where i->>'id' in ('c0000000-0000-4000-8000-000000000020','c0000000-0000-4000-8000-000000000051')) then raise exception 'Deleted content returned by feed';end if;
 if exists(select 1 from jsonb_array_elements(public.orbit_profile_page(auth.uid())->'posts') p where p->>'id'='c0000000-0000-4000-8000-000000000020') then raise exception 'Deleted post returned by profile';end if;
 if exists(select 1 from jsonb_array_elements(public.orbit_get_data()->'events') e where e->>'id' in ('c0000000-0000-4000-8000-000000000050','c0000000-0000-4000-8000-000000000051')) then raise exception 'Deleted event returned after refresh';end if;
 begin perform public.orbit_mutate('{"type":"delete_post","id":"c0000000-0000-4000-8000-000000000043","club":true}');raise exception 'Club chat deleted through post action';exception when insufficient_privilege then null;end;
end; $$;
-- Test Storage's owner-only cleanup policy; this local schema shim has no real binaries.
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-000000000002',true);
delete from storage.objects where name='c0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000011';
select public.orbit_post_cleanup_done(array['c0000000-0000-4000-8000-000000000011'::uuid]);
reset role;
do $$ begin
 if (select count(*) from orbit_private.post_file_cleanup)<>3 or not exists(select 1 from storage.objects where name like '%000000000011') then raise exception 'Other user removed cleanup file';end if;
 if exists(select 1 from public.orbit_comments where post_id='c0000000-0000-4000-8000-000000000020') or exists(select 1 from public.orbit_comment_likes where comment_id='c0000000-0000-4000-8000-000000000031') or exists(select 1 from public.orbit_likes where post_id='c0000000-0000-4000-8000-000000000020') then raise exception 'Post dependents survived';end if;
 if exists(select 1 from public.orbit_post_files where id in ('c0000000-0000-4000-8000-000000000011','c0000000-0000-4000-8000-000000000012')) then raise exception 'Attachment metadata survived';end if;
 if exists(select 1 from public.orbit_club_post_comments where post_id='c0000000-0000-4000-8000-000000000042') or exists(select 1 from public.orbit_club_comment_likes where comment_id='c0000000-0000-4000-8000-000000000044') then raise exception 'Club comment dependents survived';end if;
 if exists(select 1 from public.orbit_rsvps where event_id='c0000000-0000-4000-8000-000000000050') or exists(select 1 from public.orbit_event_choices where event_id in ('c0000000-0000-4000-8000-000000000050','c0000000-0000-4000-8000-000000000051')) then raise exception 'Event dependents survived';end if;
 if not exists(select 1 from public.orbit_posts where id='c0000000-0000-4000-8000-000000000021') or not exists(select 1 from storage.objects where name like '%000000000013') or (select count(*) from public.orbit_club_messages where id in ('c0000000-0000-4000-8000-000000000041','c0000000-0000-4000-8000-000000000043'))<>2 then raise exception 'Unrelated content deleted';end if;
end; $$;
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
delete from storage.objects where name='c0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000011';
do $$ begin perform public.orbit_post_cleanup_done(array['c0000000-0000-4000-8000-000000000011'::uuid,'c0000000-0000-4000-8000-000000000012'::uuid]); if jsonb_array_length(public.orbit_post_cleanup_files()->'files')<>2 then raise exception 'Partial cleanup lost retry job';end if;end; $$;
delete from storage.objects where name in ('c0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000012','c0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000014');
do $$ begin perform public.orbit_post_cleanup_done(array['c0000000-0000-4000-8000-000000000012'::uuid,'c0000000-0000-4000-8000-000000000014'::uuid]); if (public.orbit_get_data()->>'postFileCleanupPending')::boolean then raise exception 'Cleanup did not finish';end if;end; $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 begin perform public.orbit_mutate('{"type":"delete_event","id":"c0000000-0000-4000-8000-000000000050"}');raise exception 'Anonymous deletion accepted';exception when insufficient_privilege then null;end;
 begin perform public.orbit_post_cleanup_files();raise exception 'Anonymous cleanup access accepted';exception when insufficient_privilege then null;end;
end; $$;
rollback;
