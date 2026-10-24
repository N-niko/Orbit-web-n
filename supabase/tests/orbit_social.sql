-- Access rules and uploaded-file binding, using only rolled-back fictional data.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('70000000-0000-4000-8000-000000000001','social-a@example.invalid','{"name":"Social Alice"}'),
 ('70000000-0000-4000-8000-000000000002','social-b@example.invalid','{"name":"Social Bob"}');
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select set_config('orbit.test.social_invite',public.orbit_get_data()->'workspace'->>'inviteCode',true);
select public.orbit_file_reserve('70000000-0000-4000-8000-000000000011','campus.jpg','image/jpeg',12);
insert into storage.objects(bucket_id,name,metadata) values('orbit-post-files','70000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000011','{"size":12,"mimetype":"image/jpeg"}');
select public.orbit_mutate('{"type":"create_post","id":"70000000-0000-4000-8000-000000000021","body":"","category":"general","attachmentIds":["70000000-0000-4000-8000-000000000011"]}');
select public.orbit_mutate('{"type":"create_post","id":"70000000-0000-4000-8000-000000000021","body":"","category":"general","attachmentIds":["70000000-0000-4000-8000-000000000011"]}');
select public.orbit_mutate('{"type":"create_post","id":"70000000-0000-4000-8000-000000000022","body":"All posts use the profile setting","category":"general"}');
select public.orbit_file_reserve('70000000-0000-4000-8000-000000000012','notes.pdf','application/pdf',20);
do $$ begin
 begin perform public.orbit_mutate('{"type":"create_post","body":"Wrong file","category":"general","attachmentIds":["70000000-0000-4000-8000-000000000012"]}');
  raise exception 'Missing uploaded bytes accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.orbit_mutate('{"type":"create_post","body":"Reuse","category":"general","attachmentIds":["70000000-0000-4000-8000-000000000011"]}');
  raise exception 'Published file reused in another post'; exception when insufficient_privilege then null; end;
 begin update storage.objects set metadata='{}' where name='70000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000011';
  raise exception 'Storage metadata mutable by uploader'; exception when insufficient_privilege then null; end;
 if (public.orbit_file_release('70000000-0000-4000-8000-000000000011')->>'released')::boolean then raise exception 'Published file registration removed'; end if;
end; $$;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
do $$ declare v jsonb; begin
 v:=public.orbit_profile_page('70000000-0000-4000-8000-000000000001');
 if jsonb_array_length(v->'posts')<>2 then raise exception 'Profile setting did not include all posts'; end if;
 if not exists(select 1 from jsonb_array_elements(v->'posts') p where p->'attachments'->0->>'name'='campus.jpg') then raise exception 'Profile attachments missing'; end if;
 perform public.orbit_file_info('70000000-0000-4000-8000-000000000011');
 if not exists(select 1 from storage.objects where name='70000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000011') then raise exception 'Shared attachment storage access missing'; end if;
 begin insert into storage.objects(bucket_id,name,metadata) values('orbit-post-files','70000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000012','{"size":20,"mimetype":"application/pdf"}');
  raise exception 'Other account uploaded to owner path'; exception when insufficient_privilege then null; end;
 begin perform public.orbit_mutate('{"type":"create_post","body":"Stolen pending file","category":"general","attachmentIds":["70000000-0000-4000-8000-000000000012"]}');
  raise exception 'Other account attached pending file'; exception when insufficient_privilege then null; end;
end; $$;
select public.orbit_post_respond('70000000-0000-4000-8000-000000000021',false,'{"type":"like","liked":true}');
select public.orbit_post_respond('70000000-0000-4000-8000-000000000021',false,'{"type":"like","liked":true}');
select public.orbit_post_respond('70000000-0000-4000-8000-000000000021',false,'{"type":"comment","id":"70000000-0000-4000-8000-000000000031","body":"Reply from the profile page"}');
select public.orbit_post_respond('70000000-0000-4000-8000-000000000021',false,'{"type":"comment","id":"70000000-0000-4000-8000-000000000031","body":"Reply from the profile page"}');
do $$ declare v jsonb; begin
 v:=public.orbit_post_thread('70000000-0000-4000-8000-000000000021');
 if v->>'likeCount'<>'1' or not (v->>'liked')::boolean or v->>'commentCount'<>'1' or jsonb_array_length(v->'comments')<>1 then raise exception 'Profile responses not idempotent'; end if;
 if v->'comments'->0->'author'->>'id'<>auth.uid()::text or (select count(*) from jsonb_object_keys(v->'comments'->0->'author'))<>3 then raise exception 'Comment identity or private projection failed'; end if;
 begin perform public.orbit_post_respond('70000000-0000-4000-8000-000000000021',false,jsonb_build_object('type','comment','id',gen_random_uuid(),'body',repeat('x',1001)));
  raise exception 'Oversized comment accepted'; exception when invalid_parameter_value then null; end;
 begin insert into public.orbit_comments(post_id,author_id,body) values('70000000-0000-4000-8000-000000000021',auth.uid(),'Direct forged response');
  raise exception 'Direct comment write allowed'; exception when insufficient_privilege then null; end;
end; $$;
select public.orbit_post_respond('70000000-0000-4000-8000-000000000021',false,'{"type":"like","liked":false}');
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
select public.orbit_set_profile_visibility('posts',false);
select public.orbit_club_create('70000000-0000-4000-8000-000000000040','Social Posts Club','Posts with threads','Other','','blue');
insert into storage.objects(bucket_id,name,metadata) values('orbit-post-files','70000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000012','{"size":19,"mimetype":"application/pdf"}');
do $$ begin
 begin perform public.orbit_club_publish('70000000-0000-4000-8000-000000000040','70000000-0000-4000-8000-000000000041','',array['70000000-0000-4000-8000-000000000012'::uuid]);
  raise exception 'Uploaded byte size mismatch accepted'; exception when invalid_parameter_value then null; end;
end; $$;
reset role;
update storage.objects set metadata='{"size":20,"mimetype":"application/pdf"}' where name='70000000-0000-4000-8000-000000000001/70000000-0000-4000-8000-000000000012';
set local role authenticated;
select public.orbit_club_publish('70000000-0000-4000-8000-000000000040','70000000-0000-4000-8000-000000000041','',array['70000000-0000-4000-8000-000000000012'::uuid]);
select public.orbit_club_publish('70000000-0000-4000-8000-000000000040','70000000-0000-4000-8000-000000000041','',array['70000000-0000-4000-8000-000000000012'::uuid]);
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.orbit_post_thread('70000000-0000-4000-8000-000000000021'); raise exception 'Hidden profile retained response access'; exception when insufficient_privilege then null; end;
 begin perform public.orbit_file_info('70000000-0000-4000-8000-000000000011'); raise exception 'Hidden profile retained attachment access'; exception when no_data_found then null; end;
 begin perform public.orbit_post_thread('70000000-0000-4000-8000-000000000041',true); raise exception 'Nonfollower read club thread'; exception when insufficient_privilege then null; end;
 begin perform public.orbit_post_respond('70000000-0000-4000-8000-000000000041',true,'{"type":"like","liked":true}'); raise exception 'Nonfollower liked club post'; exception when insufficient_privilege then null; end;
 begin perform public.orbit_file_info('70000000-0000-4000-8000-000000000012'); raise exception 'Nonfollower read club file'; exception when no_data_found then null; end;
 if exists(select 1 from storage.objects where bucket_id='orbit-post-files') then raise exception 'Unauthorized files visible in Storage'; end if;
end; $$;
select public.orbit_club_follow('70000000-0000-4000-8000-000000000040',true);
select public.orbit_post_respond('70000000-0000-4000-8000-000000000041',true,'{"type":"like","liked":true}');
select public.orbit_post_respond('70000000-0000-4000-8000-000000000041',true,'{"type":"comment","id":"70000000-0000-4000-8000-000000000042","body":"A threaded club reply"}');
select public.orbit_post_respond('70000000-0000-4000-8000-000000000041',true,'{"type":"comment","id":"70000000-0000-4000-8000-000000000042","body":"A threaded club reply"}');
do $$ declare v jsonb; begin
 v:=public.orbit_club_posts('70000000-0000-4000-8000-000000000040')->'messages'->0;
 if v->>'likeCount'<>'1' or v->>'commentCount'<>'1' or not (v->>'liked')::boolean or v->'attachments'->0->>'name'<>'notes.pdf' then raise exception 'Club posts missing responses or files'; end if;
 if jsonb_array_length(public.orbit_club_messages('70000000-0000-4000-8000-000000000040')->'messages')<>0 then raise exception 'Club comments appeared as chat'; end if;
 perform public.orbit_file_info('70000000-0000-4000-8000-000000000012');
 begin perform public.orbit_post_thread('70000000-0000-4000-8000-000000000041',false); raise exception 'Stream confusion exposed club post'; exception when insufficient_privilege then null; end;
end; $$;
select public.orbit_club_follow('70000000-0000-4000-8000-000000000040',false);
do $$ begin
 begin perform public.orbit_post_thread('70000000-0000-4000-8000-000000000041',true); raise exception 'Unfollow retained thread'; exception when insufficient_privilege then null; end;
 begin perform public.orbit_file_info('70000000-0000-4000-8000-000000000012'); raise exception 'Unfollow retained file access'; exception when no_data_found then null; end;
end; $$;
-- Workspace access remains valid even when the public profile section is hidden.
select public.orbit_mutate(jsonb_build_object('type','join_workspace','code',current_setting('orbit.test.social_invite')));
select public.orbit_post_thread('70000000-0000-4000-8000-000000000021');
select public.orbit_file_info('70000000-0000-4000-8000-000000000011');
reset role;
insert into public.orbit_comments(id,post_id,author_id,body,created_at)
select gen_random_uuid(),'70000000-0000-4000-8000-000000000021','70000000-0000-4000-8000-000000000001','Earlier comment '||n,now()-interval '2 hours' from generate_series(1,25) n;
set local role authenticated;
do $$ declare a jsonb;b jsonb;begin
 a:=public.orbit_post_thread('70000000-0000-4000-8000-000000000021');
 b:=public.orbit_post_thread('70000000-0000-4000-8000-000000000021',false,(a->'comments'->0->>'id')::uuid);
 if jsonb_array_length(a->'comments')<>20 or not (a->>'hasMore')::boolean or jsonb_array_length(b->'comments')<>6 or (b->>'hasMore')::boolean then raise exception 'Comment paging incomplete';end if;
 if exists(select 1 from jsonb_array_elements(a->'comments') x join jsonb_array_elements(b->'comments') y on x->>'id'=y->>'id')then raise exception 'Comment pages overlap';end if;
 begin perform orbit_private.post_stats('70000000-0000-4000-8000-000000000021',false);raise exception 'Internal projection callable';exception when insufficient_privilege then null;end;
end;$$;
set local role anon;
do $$ begin
 begin perform public.orbit_post_thread('70000000-0000-4000-8000-000000000021');raise exception 'Anonymous thread';exception when insufficient_privilege then null;end;
 begin perform public.orbit_post_respond('70000000-0000-4000-8000-000000000021',false,'{"type":"like","liked":true}');raise exception 'Anonymous reaction';exception when insufficient_privilege then null;end;
 begin perform public.orbit_file_info('70000000-0000-4000-8000-000000000011');raise exception 'Anonymous file';exception when insufficient_privilege then null;end;
 begin perform public.orbit_file_reserve(gen_random_uuid(),'test.pdf','application/pdf',1);raise exception 'Anonymous upload';exception when insufficient_privilege then null;end;
end;$$;
reset role;
rollback;
