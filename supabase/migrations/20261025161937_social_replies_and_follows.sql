-- Extend the existing Home/club comment systems. Storage permissions are unchanged.
alter table public.orbit_comments add column parent_id uuid references public.orbit_comments(id) on delete cascade,
 add column reply_to_id uuid references public.orbit_comments(id) on delete set null,
 add check(parent_id is distinct from id), add check(reply_to_id is distinct from id);
alter table public.orbit_club_post_comments add column parent_id uuid references public.orbit_club_post_comments(id) on delete cascade,
 add column reply_to_id uuid references public.orbit_club_post_comments(id) on delete set null,
 add check(parent_id is distinct from id), add check(reply_to_id is distinct from id);
create index orbit_comments_parent_idx on public.orbit_comments(parent_id);
create index orbit_comments_reply_idx on public.orbit_comments(reply_to_id);
create index orbit_club_comments_parent_idx on public.orbit_club_post_comments(parent_id);
create index orbit_club_comments_reply_idx on public.orbit_club_post_comments(reply_to_id);
create table public.orbit_comment_likes(comment_id uuid not null references public.orbit_comments(id) on delete cascade,
 profile_id uuid not null references public.orbit_profiles(id) on delete cascade, primary key(comment_id,profile_id));
create table public.orbit_club_comment_likes(comment_id uuid not null references public.orbit_club_post_comments(id) on delete cascade,
 profile_id uuid not null references public.orbit_profiles(id) on delete cascade, primary key(comment_id,profile_id));
create index orbit_comment_likes_profile_idx on public.orbit_comment_likes(profile_id);
create index orbit_club_comment_likes_profile_idx on public.orbit_club_comment_likes(profile_id);
create table public.orbit_user_follows(follower_id uuid not null references public.orbit_profiles(id) on delete cascade,
 followed_id uuid not null references public.orbit_profiles(id) on delete cascade,created_at timestamptz not null default clock_timestamp(),
 primary key(follower_id,followed_id),check(follower_id<>followed_id));
create index orbit_user_follows_reverse_idx on public.orbit_user_follows(followed_id,follower_id);
alter table public.orbit_comment_likes enable row level security;
alter table public.orbit_club_comment_likes enable row level security;
alter table public.orbit_user_follows enable row level security;
revoke all on public.orbit_comment_likes,public.orbit_club_comment_likes,public.orbit_user_follows from public,anon,authenticated;
grant select on public.orbit_comment_likes,public.orbit_club_comment_likes,public.orbit_user_follows to authenticated;

create function orbit_private.can_read_comment(p_id uuid,p_club boolean) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from (
 select post_id from public.orbit_comments where not p_club and id=p_id union all
 select post_id from public.orbit_club_post_comments where p_club and id=p_id) c where orbit_private.can_read_post(c.post_id,p_club));
$$;
create policy comment_likes_read on public.orbit_comment_likes for select to authenticated using(orbit_private.can_read_comment(comment_id,false));
create policy club_comment_likes_read on public.orbit_club_comment_likes for select to authenticated using(orbit_private.can_read_comment(comment_id,true));
-- The social graph is visible to signed-in students; it grants no content access.
create policy user_follows_read on public.orbit_user_follows for select to authenticated using((select auth.uid()) is not null);

-- Return only public identity fields. Private photos retain their current workspace restrictions.
create function orbit_private.social_person(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'name',p.name,'color',p.color,'university',p.university,
 'avatarPath',case when auth.uid()=p.id or public._orbit_shares_workspace(p.id) then p.avatar_path end)
 from public.orbit_profiles p where p.id=p_id;
$$;
create function orbit_private.social_comment(p_id uuid,p_club boolean) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'author',orbit_private.social_person(c.author_id),'body',c.body,'createdAt',c.created_at,
 'parentId',c.parent_id,'replyToId',c.reply_to_id,'replyToName',(select p.name from public.orbit_profiles p where p.id=(select author_id from (
 select id,author_id from public.orbit_comments where not p_club union all select id,author_id from public.orbit_club_post_comments where p_club) x where x.id=c.reply_to_id)),
 'likeCount',(select count(*) from (select profile_id from public.orbit_comment_likes where not p_club and comment_id=c.id union all select profile_id from public.orbit_club_comment_likes where p_club and comment_id=c.id) k),
 'liked',exists(select 1 from public.orbit_comment_likes where not p_club and comment_id=c.id and profile_id=auth.uid()) or exists(select 1 from public.orbit_club_comment_likes where p_club and comment_id=c.id and profile_id=auth.uid()))
 from (select id,author_id,body,created_at,parent_id,reply_to_id from public.orbit_comments where not p_club and id=p_id union all
 select id,author_id,body,created_at,parent_id,reply_to_id from public.orbit_club_post_comments where p_club and id=p_id) c;
$$;
create or replace function orbit_private.post_thread(p_post uuid,p_club boolean default false,p_before uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare stamp timestamptz; items jsonb; parents jsonb; more boolean; begin
 if auth.uid() is null or not orbit_private.can_read_post(p_post,p_club) then raise exception 'Post not available' using errcode='42501'; end if;
 if p_before is not null then
  select created_at into stamp from (select id,created_at from public.orbit_comments where not p_club and post_id=p_post union all
   select id,created_at from public.orbit_club_post_comments where p_club and post_id=p_post) c where id=p_before;
  if not found then raise exception 'Comment not found' using errcode='P0002'; end if;
 end if;
 with all_comments as (select id,created_at,parent_id from public.orbit_comments where not p_club and post_id=p_post union all
  select id,created_at,parent_id from public.orbit_club_post_comments where p_club and post_id=p_post),
 candidates as(select * from all_comments where p_before is null or (created_at,id)<(stamp,p_before) order by created_at desc,id desc limit 21),
 page as(select * from candidates order by created_at desc,id desc limit 20)
 select coalesce((select jsonb_agg(orbit_private.social_comment(id,p_club) order by created_at,id) from page),'[]'::jsonb),
 coalesce((select jsonb_agg(orbit_private.social_comment(root_id,p_club)) from (select distinct parent_id root_id from page where parent_id is not null and parent_id not in(select id from page)) r),'[]'::jsonb),
 (select count(*)>20 from candidates) into items,parents,more;
 return orbit_private.post_stats(p_post,p_club)||jsonb_build_object('comments',items,'parents',parents,'hasMore',more);
end; $$;

alter function orbit_private.post_respond(uuid,boolean,jsonb) rename to basic_post_respond;
create function orbit_private.post_respond(p_post uuid,p_club boolean,p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); cid uuid; rid uuid; root_id uuid; v_club uuid; existing record; target record; begin
 if p_action->>'type'='like' then return orbit_private.basic_post_respond(p_post,p_club,p_action); end if;
 if u is null then raise exception 'Sign in' using errcode='42501'; end if;
 if p_club then
  select club_id into v_club from public.orbit_club_messages where id=p_post and kind='post';
  perform 1 from public.orbit_clubs where id=v_club for update;
  perform 1 from public.orbit_club_messages where id=p_post and kind='post' for update;
 else perform 1 from public.orbit_posts where id=p_post for update; end if;
 if not orbit_private.can_read_post(p_post,p_club) then raise exception 'Post not available' using errcode='42501'; end if;
 cid:=(p_action->>'id')::uuid;
 if cid is null then raise exception 'Invalid comment' using errcode='22023'; end if;
 if p_action->>'type'='comment_like' and jsonb_typeof(p_action->'liked')='boolean' then
  if not exists(select 1 from (select id,post_id from public.orbit_comments where not p_club union all select id,post_id from public.orbit_club_post_comments where p_club) c where c.id=cid and c.post_id=p_post) then raise exception 'Comment not found' using errcode='P0002'; end if;
  if (p_action->>'liked')::boolean then
   if p_club then insert into public.orbit_club_comment_likes values(cid,u) on conflict do nothing; else insert into public.orbit_comment_likes values(cid,u) on conflict do nothing; end if;
  else
   if p_club then delete from public.orbit_club_comment_likes where comment_id=cid and profile_id=u; else delete from public.orbit_comment_likes where comment_id=cid and profile_id=u; end if;
  end if;
 elsif p_action->>'type'='comment' then
  if p_action->>'body' is null or char_length(btrim(p_action->>'body')) not between 1 and 1000 then raise exception 'Invalid comment' using errcode='22023'; end if;
  rid:=(p_action->>'replyToId')::uuid;
  if rid is not null then
   select * into target from (select id,post_id,parent_id from public.orbit_comments where not p_club union all select id,post_id,parent_id from public.orbit_club_post_comments where p_club) c where c.id=rid and c.post_id=p_post;
   if not found or rid=cid then raise exception 'Reply target not found' using errcode='P0002'; end if;
   root_id:=coalesce(target.parent_id,target.id);
  end if;
  select * into existing from (select id,post_id,author_id,body,parent_id,reply_to_id from public.orbit_comments where not p_club union all
   select id,post_id,author_id,body,parent_id,reply_to_id from public.orbit_club_post_comments where p_club) c where c.id=cid;
  if found then
   if existing.post_id<>p_post or existing.author_id<>u or existing.body<>btrim(p_action->>'body') or existing.parent_id is distinct from root_id or existing.reply_to_id is distinct from rid then raise exception 'Comment request conflicts' using errcode='22023'; end if;
  else
   perform 1 from public.orbit_profiles where id=u for update;
   if (select count(*) from (select id from public.orbit_comments where author_id=u and created_at>clock_timestamp()-interval '1 minute' union all select id from public.orbit_club_post_comments where author_id=u and created_at>clock_timestamp()-interval '1 minute') c)>=30 then raise exception 'Commenting quickly' using errcode='P0001'; end if;
   if p_club then insert into public.orbit_club_post_comments(id,post_id,author_id,body,parent_id,reply_to_id) values(cid,p_post,u,btrim(p_action->>'body'),root_id,rid);
   else insert into public.orbit_comments(id,post_id,author_id,body,parent_id,reply_to_id) values(cid,p_post,u,btrim(p_action->>'body'),root_id,rid); end if;
  end if;
 else raise exception 'Invalid response' using errcode='22023'; end if;
 return orbit_private.post_thread(p_post,p_club)||jsonb_build_object('updatedComment',orbit_private.social_comment(cid,p_club));
end; $$;

create function orbit_private.post_people(p_post uuid,p_club boolean,p_after uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb; more boolean; begin
 if auth.uid() is null or not orbit_private.can_read_post(p_post,p_club) then raise exception 'Post not available' using errcode='42501'; end if;
 with people as(select profile_id from public.orbit_likes where not p_club and post_id=p_post union all select profile_id from public.orbit_club_post_likes where p_club and post_id=p_post),
 page as(select profile_id,row_number() over(order by profile_id) n from people where p_after is null or profile_id>p_after order by profile_id limit 51)
 select coalesce((select jsonb_agg(orbit_private.social_person(profile_id) order by profile_id) from page where n<=50),'[]'::jsonb),(select count(*)>50 from page) into items,more;
 return jsonb_build_object('users',items,'hasMore',more);
end; $$;

create function orbit_private.profile_social(p_profile uuid,p_kind text default 'stats',p_following boolean default null,p_after uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); items jsonb; more boolean; begin
 if u is null then raise exception 'Sign in' using errcode='42501'; end if;
 if not exists(select 1 from public.orbit_profiles where id=p_profile) then raise exception 'Profile not found' using errcode='P0002'; end if;
 if p_kind='stats' then
  if p_following is not null then
   if u=p_profile then raise exception 'Cannot follow yourself' using errcode='22023'; end if;
   perform 1 from public.orbit_profiles where id=u for update;
   if p_following then
    if not exists(select 1 from public.orbit_user_follows where follower_id=u and followed_id=p_profile) and (select count(*) from public.orbit_user_follows where follower_id=u and created_at>now()-interval '1 minute')>=30 then raise exception 'Following quickly' using errcode='P0001'; end if;
    insert into public.orbit_user_follows(follower_id,followed_id) values(u,p_profile) on conflict do nothing;
   else delete from public.orbit_user_follows where follower_id=u and followed_id=p_profile; end if;
  end if;
  return jsonb_build_object('followerCount',(select count(*) from public.orbit_user_follows where followed_id=p_profile),
   'followingCount',(select count(*) from public.orbit_user_follows where follower_id=p_profile),
   'following',exists(select 1 from public.orbit_user_follows where follower_id=u and followed_id=p_profile));
 elsif p_kind in('followers','following') and p_following is null then
  with people as(select case when p_kind='followers' then follower_id else followed_id end profile_id from public.orbit_user_follows where case when p_kind='followers' then followed_id=p_profile else follower_id=p_profile end),
  page as(select profile_id,row_number() over(order by profile_id) n from people where p_after is null or profile_id>p_after order by profile_id limit 51)
  select coalesce((select jsonb_agg(orbit_private.social_person(profile_id) order by profile_id) from page where n<=50),'[]'::jsonb),(select count(*)>50 from page) into items,more;
  return jsonb_build_object('users',items,'hasMore',more);
 end if;
 raise exception 'Invalid profile request' using errcode='22023';
end; $$;

-- Reuse the current profile visibility checks and pagination; only add safe avatar identity.
alter function orbit_private.profile_page(uuid,uuid) rename to social_base_profile_page;
create function orbit_private.profile_page(p_profile uuid,p_before uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 result:=orbit_private.social_base_profile_page(p_profile,p_before);
 return jsonb_set(result,'{profile}',result->'profile'||orbit_private.social_person(p_profile));
end; $$;
-- Snapshot comment authors must stay minimal even when a profile visitor replies.
alter function orbit_private.get_data() rename to social_base_data;
create function orbit_private.get_data() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 result:=orbit_private.social_base_data();
 return jsonb_set(result,'{posts}',coalesce((select jsonb_agg(item||jsonb_build_object('comments',coalesce((select jsonb_agg(orbit_private.social_comment(c.id,false) order by c.created_at,c.id) from public.orbit_comments c where c.post_id=(item->>'id')::uuid),'[]'::jsonb)) order by ord)
 from jsonb_array_elements(result->'posts') with ordinality p(item,ord)),'[]'::jsonb));
end; $$;

create or replace function orbit_private.club_posts(p_club uuid,p_before uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; items jsonb; begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 result:=orbit_private.club_entries(p_club,'post',p_before);
 select coalesce(jsonb_agg(item||orbit_private.post_stats((item->>'id')::uuid,true)||jsonb_build_object('author',orbit_private.social_person((item->'author'->>'id')::uuid)) order by item->>'createdAt',item->>'id'),'[]'::jsonb)
 into items from jsonb_array_elements(result->'messages') item;
 return result||jsonb_build_object('messages',items);
end; $$;

-- Rebind wrappers after renaming their implementation functions.
create or replace function public.orbit_post_respond(p_post uuid,p_club boolean,p_action jsonb) returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.post_respond(p_post,p_club,p_action); $$;
create or replace function public.orbit_get_data() returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.get_data(); $$;
create or replace function public.orbit_profile_page(p_profile uuid,p_before uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$ select orbit_private.profile_page(p_profile,p_before); $$;
create function public.orbit_post_people(p_post uuid,p_club boolean default false,p_after uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$ select orbit_private.post_people(p_post,p_club,p_after); $$;
create function public.orbit_profile_social(p_profile uuid,p_kind text default 'stats',p_following boolean default null,p_after uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.profile_social(p_profile,p_kind,p_following,p_after); $$;
revoke all on function orbit_private.social_person(uuid),orbit_private.social_comment(uuid,boolean),orbit_private.basic_post_respond(uuid,boolean,jsonb),orbit_private.social_base_profile_page(uuid,uuid),orbit_private.social_base_data() from public,anon,authenticated;
revoke all on function orbit_private.can_read_comment(uuid,boolean),orbit_private.post_respond(uuid,boolean,jsonb),orbit_private.post_people(uuid,boolean,uuid),orbit_private.profile_social(uuid,text,boolean,uuid),orbit_private.profile_page(uuid,uuid),orbit_private.get_data(),public.orbit_post_people(uuid,boolean,uuid),public.orbit_profile_social(uuid,text,boolean,uuid) from public,anon,authenticated;
grant execute on function orbit_private.can_read_comment(uuid,boolean),orbit_private.post_respond(uuid,boolean,jsonb),orbit_private.post_people(uuid,boolean,uuid),orbit_private.profile_social(uuid,text,boolean,uuid),orbit_private.profile_page(uuid,uuid),orbit_private.get_data(),public.orbit_post_people(uuid,boolean,uuid),public.orbit_profile_social(uuid,text,boolean,uuid) to authenticated;
notify pgrst,'reload schema';
