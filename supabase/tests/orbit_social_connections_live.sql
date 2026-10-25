-- Hosted smoke test: uses two existing accounts, with every change rolled back.
begin;
do $$ declare a uuid; b uuid; begin
 select id into a from public.orbit_profiles order by id limit 1;
 select id into b from public.orbit_profiles where id<>a order by id limit 1;
 if a is null or b is null then raise exception 'Two existing profiles are needed'; end if;
 perform set_config('orbit.social.actor_a',a::text,true);perform set_config('orbit.social.actor_b',b::text,true);
 perform set_config('request.jwt.claim.sub',a::text,true);
end; $$;
set local role authenticated;
do $$ begin
 perform public.orbit_set_profile_visibility('posts',true);
 perform public.orbit_mutate('{"type":"create_post","id":"af000000-0000-4000-8000-000000000001","body":"Rollback-only social verification","category":"general"}');
 perform public.orbit_post_respond('af000000-0000-4000-8000-000000000001',false,'{"type":"comment","id":"af000000-0000-4000-8000-000000000002","body":"Root verification comment"}');
 perform set_config('request.jwt.claim.sub',current_setting('orbit.social.actor_b'),true);
end; $$;
do $$ declare v jsonb; begin
 perform public.orbit_post_respond('af000000-0000-4000-8000-000000000001',false,'{"type":"comment","id":"af000000-0000-4000-8000-000000000003","body":"Reply verification","replyToId":"af000000-0000-4000-8000-000000000002"}');
 v:=public.orbit_post_respond('af000000-0000-4000-8000-000000000001',false,'{"type":"comment_like","id":"af000000-0000-4000-8000-000000000002","liked":true}');
 v:=public.orbit_post_respond('af000000-0000-4000-8000-000000000001',false,'{"type":"comment_like","id":"af000000-0000-4000-8000-000000000002","liked":true}');
 if v->'updatedComment'->>'likeCount'<>'1' or v->'comments'->1->>'parentId'<>'af000000-0000-4000-8000-000000000002' then raise exception 'Comment reaction or reply failed'; end if;
 perform public.orbit_post_respond('af000000-0000-4000-8000-000000000001',false,'{"type":"like","liked":true}');
 v:=public.orbit_post_people('af000000-0000-4000-8000-000000000001');
 if jsonb_array_length(v->'users')<>1 or v->'users'->0->>'id'<>auth.uid()::text or v->'users'->0 ? 'email' then raise exception 'Liker list or privacy failed'; end if;
 v:=public.orbit_profile_social(current_setting('orbit.social.actor_a')::uuid,'stats',true);
 v:=public.orbit_profile_social(current_setting('orbit.social.actor_a')::uuid,'stats',true);
 if not(v->>'following')::boolean then raise exception 'Follow failed'; end if;
 v:=public.orbit_profile_social(current_setting('orbit.social.actor_a')::uuid,'stats',false);
 if (v->>'following')::boolean then raise exception 'Unfollow failed'; end if;
end; $$;
reset role;
rollback;
select 'Live social checks passed; all changes rolled back' as result,
 (select count(*) from public.orbit_posts where id='af000000-0000-4000-8000-000000000001') as retained_test_posts;
