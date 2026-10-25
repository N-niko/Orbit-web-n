begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('a0000000-0000-4000-8000-000000000001','connections-a@example.invalid','{"name":"Connection Alice"}'),
 ('a0000000-0000-4000-8000-000000000002','connections-b@example.invalid','{"name":"Connection Bob"}'),
 ('a0000000-0000-4000-8000-000000000003','connections-c@example.invalid','{"name":"Connection Cara"}');
update public.orbit_profiles set avatar_path=id::text||'/private-photo.png',residence_hall=null,bio='Private bio' where id='a0000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select public.orbit_get_data();
select public.orbit_mutate('{"type":"create_post","id":"a0000000-0000-4000-8000-000000000011","body":"Original conversation","category":"general"}');
select public.orbit_post_respond('a0000000-0000-4000-8000-000000000011',false,'{"type":"comment","id":"a0000000-0000-4000-8000-000000000021","body":"A root comment"}');
select public.orbit_set_profile_visibility('posts',false);
select public.orbit_club_create('a0000000-0000-4000-8000-000000000040','Connections Club','Access checks for conversations','Other','','violet');
select public.orbit_club_publish('a0000000-0000-4000-8000-000000000040','a0000000-0000-4000-8000-000000000041','Club post');
select public.orbit_post_respond('a0000000-0000-4000-8000-000000000041',true,'{"type":"comment","id":"a0000000-0000-4000-8000-000000000042","body":"Club root"}');
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
select public.orbit_get_data();
select public.orbit_mutate('{"type":"create_post","id":"a0000000-0000-4000-8000-000000000012","body":"Another conversation","category":"general"}');
select public.orbit_post_respond('a0000000-0000-4000-8000-000000000012',false,'{"type":"comment","id":"a0000000-0000-4000-8000-000000000022","body":"Other post root"}');
do $$ declare v jsonb; begin
 v:=public.orbit_profile_social('a0000000-0000-4000-8000-000000000001','stats',true);
 perform public.orbit_profile_social('a0000000-0000-4000-8000-000000000001','stats',true);
 if v->>'followerCount'<>'1' or not(v->>'following')::boolean then raise exception 'Follow did not persist'; end if;
 if public.orbit_profile_social(auth.uid())->>'followingCount'<>'1' then raise exception 'Following count incorrect'; end if;
 if jsonb_array_length(public.orbit_profile_social(auth.uid(),'followers')->'users')<>0 then raise exception 'Following became reciprocal'; end if;
 if public.orbit_profile_page('a0000000-0000-4000-8000-000000000001')->'posts'<>'null'::jsonb then raise exception 'Following unlocked profile posts'; end if;
 begin perform public.orbit_profile_social(auth.uid(),'stats',true); raise exception 'Self-follow allowed'; exception when invalid_parameter_value then null; end;
 begin insert into public.orbit_user_follows(follower_id,followed_id) values(auth.uid(),'a0000000-0000-4000-8000-000000000003'); raise exception 'Direct follow write allowed'; exception when insufficient_privilege then null; end;
 begin perform public.orbit_post_people('a0000000-0000-4000-8000-000000000011'); raise exception 'Following unlocked likers'; exception when insufficient_privilege then null; end;
 begin perform public.orbit_post_respond('a0000000-0000-4000-8000-000000000011',false,'{"type":"comment_like","id":"a0000000-0000-4000-8000-000000000021","liked":true}'); raise exception 'Following unlocked comments'; exception when insufficient_privilege then null; end;
 begin perform public.orbit_post_respond('a0000000-0000-4000-8000-000000000041',true,'{"type":"comment","id":"a0000000-0000-4000-8000-000000000043","body":"Unauthorized reply","replyToId":"a0000000-0000-4000-8000-000000000042"}'); raise exception 'User follow unlocked club replies'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select public.orbit_set_profile_visibility('posts',true);
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
select public.orbit_post_respond('a0000000-0000-4000-8000-000000000011',false,'{"type":"comment","id":"a0000000-0000-4000-8000-000000000023","body":"First reply","replyToId":"a0000000-0000-4000-8000-000000000021"}');
select public.orbit_post_respond('a0000000-0000-4000-8000-000000000011',false,'{"type":"comment","id":"a0000000-0000-4000-8000-000000000024","body":"Reply within conversation","replyToId":"a0000000-0000-4000-8000-000000000023"}');
do $$ declare v jsonb; begin
 v:=public.orbit_post_respond('a0000000-0000-4000-8000-000000000011',false,'{"type":"comment_like","id":"a0000000-0000-4000-8000-000000000021","liked":true}');
 v:=public.orbit_post_respond('a0000000-0000-4000-8000-000000000011',false,'{"type":"comment_like","id":"a0000000-0000-4000-8000-000000000021","liked":true}');
 if v->'updatedComment'->>'likeCount'<>'1' or not(v->'updatedComment'->>'liked')::boolean then raise exception 'Comment likes not idempotent'; end if;
 if v->'comments'->2->>'parentId'<>'a0000000-0000-4000-8000-000000000021' or v->'comments'->2->>'replyToId'<>'a0000000-0000-4000-8000-000000000023' then raise exception 'Reply nesting not flattened'; end if;
 perform public.orbit_post_respond('a0000000-0000-4000-8000-000000000011',false,'{"type":"comment","id":"a0000000-0000-4000-8000-000000000024","body":"Reply within conversation","replyToId":"a0000000-0000-4000-8000-000000000023"}');
 if public.orbit_post_thread('a0000000-0000-4000-8000-000000000011')->>'commentCount'<>'3' then raise exception 'Reply retry duplicated'; end if;
 begin perform public.orbit_post_respond('a0000000-0000-4000-8000-000000000011',false,'{"type":"comment","id":"a0000000-0000-4000-8000-000000000025","body":"Wrong parent","replyToId":"a0000000-0000-4000-8000-000000000022"}'); raise exception 'Cross-post parent accepted'; exception when no_data_found then null; end;
 begin perform public.orbit_post_respond('a0000000-0000-4000-8000-000000000011',false,'{"type":"comment_like","id":"a0000000-0000-4000-8000-000000000022","liked":true}'); raise exception 'Cross-post comment liked'; exception when no_data_found then null; end;
 begin perform public.orbit_post_respond('a0000000-0000-4000-8000-000000000011',false,'{"type":"comment","id":"a0000000-0000-4000-8000-000000000024","body":"Reply within conversation","replyToId":"a0000000-0000-4000-8000-000000000021"}'); raise exception 'Retry changed parent'; exception when invalid_parameter_value then null; end;
 begin insert into public.orbit_comment_likes values('a0000000-0000-4000-8000-000000000021',auth.uid()); raise exception 'Direct comment like write allowed'; exception when insufficient_privilege then null; end;
 v:=public.orbit_post_respond('a0000000-0000-4000-8000-000000000011',false,'{"type":"comment_like","id":"a0000000-0000-4000-8000-000000000021","liked":false}');
 if v->'updatedComment'->>'likeCount'<>'0' then raise exception 'Unlike failed'; end if;
 perform public.orbit_post_respond('a0000000-0000-4000-8000-000000000011',false,'{"type":"like","liked":true}');
end; $$;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
do $$ declare v jsonb; p jsonb; begin
 v:=public.orbit_post_people('a0000000-0000-4000-8000-000000000011');
 if jsonb_array_length(v->'users')<>1 or v->'users'->0->>'id'<>'a0000000-0000-4000-8000-000000000002' then raise exception 'Post likers missing'; end if;
 p:=v->'users'->0;
 if p->>'avatarPath' is not null or exists(select 1 from jsonb_object_keys(p) k where k not in('id','name','color','university','avatarPath')) then raise exception 'Private liker details exposed'; end if;
 p:=public.orbit_profile_social(auth.uid(),'followers')->'users'->0;
 if p->>'avatarPath' is not null or p ? 'email' or p ? 'residenceHall' then raise exception 'Private follower details exposed'; end if;
 p:=public.orbit_get_data()->'posts'->0->'comments'->1->'author';
 if p ? 'email' or p ? 'residenceHall' or p ? 'bio' then raise exception 'Workspace snapshot leaked visiting commenter details'; end if;
end; $$;
-- Exercise comment history when the parent lies outside the latest page.
reset role;
insert into public.orbit_comments(id,post_id,author_id,body,created_at) select gen_random_uuid(),'a0000000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000001','History '||g,now()+g*interval '1 second' from generate_series(1,25) g;
insert into public.orbit_comments(id,post_id,author_id,body,parent_id,reply_to_id,created_at) values('a0000000-0000-4000-8000-000000000029','a0000000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000002','Recent reply to old root','a0000000-0000-4000-8000-000000000021','a0000000-0000-4000-8000-000000000021',now()+interval '1 minute');
set local role authenticated;
do $$ declare v jsonb; older jsonb; begin
 v:=public.orbit_post_thread('a0000000-0000-4000-8000-000000000011');
 if jsonb_array_length(v->'comments')<>20 or jsonb_array_length(v->'parents')<>1 or v->'parents'->0->>'id'<>'a0000000-0000-4000-8000-000000000021' then raise exception 'Parent context or pagination failed'; end if;
 older:=public.orbit_post_thread('a0000000-0000-4000-8000-000000000011',false,(v->'comments'->0->>'id')::uuid);
 if jsonb_array_length(older->'comments')<>9 then raise exception 'Comment cursor skipped replies'; end if;
end; $$;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
select public.orbit_club_follow('a0000000-0000-4000-8000-000000000040',true);
select public.orbit_post_respond('a0000000-0000-4000-8000-000000000041',true,'{"type":"comment","id":"a0000000-0000-4000-8000-000000000043","body":"Authorized club reply","replyToId":"a0000000-0000-4000-8000-000000000042"}');
select public.orbit_post_respond('a0000000-0000-4000-8000-000000000041',true,'{"type":"comment_like","id":"a0000000-0000-4000-8000-000000000042","liked":true}');
select public.orbit_post_respond('a0000000-0000-4000-8000-000000000041',true,'{"type":"like","liked":true}');
do $$ begin if jsonb_array_length(public.orbit_post_people('a0000000-0000-4000-8000-000000000041',true)->'users')<>1 then raise exception 'Club likers missing'; end if; end; $$;
select public.orbit_club_follow('a0000000-0000-4000-8000-000000000040',false);
do $$ begin
 begin perform public.orbit_post_people('a0000000-0000-4000-8000-000000000041',true); raise exception 'Former club member read likers'; exception when insufficient_privilege then null; end;
 begin perform public.orbit_post_respond('a0000000-0000-4000-8000-000000000041',true,'{"type":"comment_like","id":"a0000000-0000-4000-8000-000000000042","liked":false}'); raise exception 'Former member changed likes'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.orbit_club_comment_likes) then raise exception 'Club comment likes leaked through RLS'; end if;
end; $$;
-- Page large follower lists without returning private fields or duplicating students.
reset role;
insert into auth.users(id,email,raw_user_meta_data) select gen_random_uuid(),'follower-'||g||'@example.invalid',jsonb_build_object('name','Follower '||g) from generate_series(1,52) g;
insert into public.orbit_user_follows(follower_id,followed_id) select id,'a0000000-0000-4000-8000-000000000001' from public.orbit_profiles where name like 'Follower %';
set local role authenticated;
do $$ declare v jsonb; next_page jsonb; begin
 v:=public.orbit_profile_social('a0000000-0000-4000-8000-000000000001','followers');
 if jsonb_array_length(v->'users')<>50 or not(v->>'hasMore')::boolean then raise exception 'Follower page not bounded'; end if;
 next_page:=public.orbit_profile_social('a0000000-0000-4000-8000-000000000001','followers',null,(v->'users'->49->>'id')::uuid);
 if jsonb_array_length(next_page->'users')<>3 or (next_page->>'hasMore')::boolean then raise exception 'Follower cursor failed'; end if;
 perform public.orbit_profile_social('a0000000-0000-4000-8000-000000000001','stats',false);
 if (public.orbit_profile_social('a0000000-0000-4000-8000-000000000001')->>'following')::boolean then raise exception 'Unfollow failed'; end if;
end; $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.orbit_profile_social('a0000000-0000-4000-8000-000000000001'); raise exception 'Anonymous social graph access'; exception when insufficient_privilege then null; end;
 begin perform public.orbit_post_people('a0000000-0000-4000-8000-000000000011'); raise exception 'Anonymous liker access'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
