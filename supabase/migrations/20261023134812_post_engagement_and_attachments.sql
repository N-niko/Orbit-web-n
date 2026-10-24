begin;

-- One profile setting controls every Home feed post. Legacy per-post flags are ignored.
create index orbit_posts_author_page_idx on public.orbit_posts(author_id,created_at desc,id desc);
alter table public.orbit_posts drop constraint orbit_posts_body_check;
alter table public.orbit_posts add constraint orbit_posts_body_check check(char_length(btrim(body))<=3000);
alter table public.orbit_club_messages drop constraint orbit_club_messages_body_check;
alter table public.orbit_club_messages add constraint orbit_club_messages_body_check check(
 (kind='chat' and char_length(btrim(body)) between 1 and 2000) or (kind='post' and char_length(btrim(body))<=3000));

create function orbit_private.can_read_post(p_post uuid,p_club boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null or p_club is null then return false; end if;
 if p_club then return exists(select 1 from public.orbit_club_messages m join public.orbit_club_follows f on f.club_id=m.club_id
   where m.id=p_post and m.kind='post' and f.profile_id=auth.uid()); end if;
 return exists(select 1 from public.orbit_posts p join public.orbit_profiles a on a.id=p.author_id
   where p.id=p_post and (public._orbit_is_member(p.workspace_id) or coalesce((a.visibility->>'posts')::boolean,false)));
end; $$;

create table public.orbit_club_post_likes (
 post_id uuid not null references public.orbit_club_messages(id) on delete cascade,
 profile_id uuid not null references public.orbit_profiles(id) on delete cascade, primary key(post_id,profile_id));
create index orbit_club_post_likes_profile_idx on public.orbit_club_post_likes(profile_id);
create table public.orbit_club_post_comments (
 id uuid primary key, post_id uuid not null references public.orbit_club_messages(id) on delete cascade,
 author_id uuid not null references public.orbit_profiles(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 1000), created_at timestamptz not null default clock_timestamp());
create index orbit_club_post_comments_page_idx on public.orbit_club_post_comments(post_id,created_at desc,id desc);
create index orbit_club_post_comments_author_idx on public.orbit_club_post_comments(author_id,created_at);
create index orbit_comments_author_time_idx on public.orbit_comments(author_id,created_at);
alter table public.orbit_club_post_likes enable row level security;
alter table public.orbit_club_post_comments enable row level security;
revoke all on public.orbit_club_post_likes,public.orbit_club_post_comments from public,anon,authenticated;
grant select on public.orbit_club_post_likes,public.orbit_club_post_comments to authenticated;
create policy club_post_likes_read on public.orbit_club_post_likes for select to authenticated using(orbit_private.can_read_post(post_id,true));
create policy club_post_comments_read on public.orbit_club_post_comments for select to authenticated using(orbit_private.can_read_post(post_id,true));

create table public.orbit_post_files (
 id uuid primary key, owner_id uuid not null references public.orbit_profiles(id) on delete cascade,
 path text not null unique, name text not null check(char_length(name) between 1 and 240),
 mime text not null check(mime in ('image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv',
 'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip')),
 size integer not null check(size between 1 and 5242880),
 post_id uuid references public.orbit_posts(id) on delete cascade,
 club_post_id uuid references public.orbit_club_messages(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(), check(post_id is null or club_post_id is null),
 check(path=owner_id::text||'/'||id::text));
create index orbit_post_files_owner_idx on public.orbit_post_files(owner_id,created_at);
create index orbit_post_files_post_idx on public.orbit_post_files(post_id);
create index orbit_post_files_club_post_idx on public.orbit_post_files(club_post_id);
alter table public.orbit_post_files enable row level security;
revoke all on public.orbit_post_files from public,anon,authenticated;
grant select on public.orbit_post_files to authenticated;
create policy post_files_owner_read on public.orbit_post_files for select to authenticated using(owner_id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('orbit-post-files','orbit-post-files',false,5242880,array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv',
 'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip']);

create function orbit_private.file_allowed(p_path text,p_write boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null then return false; end if;
 return exists(select 1 from public.orbit_post_files f where f.path=p_path and (
  (f.owner_id=auth.uid() and f.post_id is null and f.club_post_id is null and (not p_write or f.created_at>now()-interval '1 day'))
  or (not p_write and ((f.post_id is not null and orbit_private.can_read_post(f.post_id,false))
    or (f.club_post_id is not null and orbit_private.can_read_post(f.club_post_id,true))))));
end; $$;
create policy orbit_files_upload on storage.objects for insert to authenticated
 with check(bucket_id='orbit-post-files' and orbit_private.file_allowed(name,true));
create policy orbit_files_read on storage.objects for select to authenticated
 using(bucket_id='orbit-post-files' and orbit_private.file_allowed(name,false));
create policy orbit_files_discard on storage.objects for delete to authenticated using(bucket_id='orbit-post-files' and exists(
 select 1 from public.orbit_post_files f where f.path=name and f.owner_id=(select auth.uid()) and f.post_id is null and f.club_post_id is null));

create function orbit_private.file_reserve(p_id uuid,p_name text,p_mime text,p_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); f public.orbit_post_files; begin
 if u is null then raise exception 'Sign in to attach files' using errcode='42501'; end if;
 if p_id is null or p_name is null or char_length(p_name) not between 1 and 240 or p_name ~ '[[:cntrl:]/]' or position(chr(92) in p_name)>0
  or lower(p_name) !~ '[.](jpe?g|png|webp|gif|pdf|txt|csv|docx?|xlsx?|pptx?|zip)$'
  or p_size is null or p_size not between 1 and 5242880 then raise exception 'Invalid file' using errcode='22023'; end if;
 perform 1 from public.orbit_profiles where id=u for update;
 select * into f from public.orbit_post_files where id=p_id;
 if found then
  if f.owner_id<>u or f.name<>p_name or f.mime<>p_mime or f.size<>p_size or f.post_id is not null or f.club_post_id is not null then
   raise exception 'File request conflicts' using errcode='22023'; end if;
 else
  if (select count(*) from public.orbit_post_files where owner_id=u and created_at>now()-interval '1 day')>=40
   or (select coalesce(sum(size),0) from public.orbit_post_files where owner_id=u)+p_size>104857600 then
   raise exception 'File allowance reached' using errcode='P0005'; end if;
  insert into public.orbit_post_files(id,owner_id,path,name,mime,size) values(p_id,u,u::text||'/'||p_id::text,p_name,p_mime,p_size) returning * into f;
 end if;
 return jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',f.size,'path',f.path);
end; $$;
create function orbit_private.file_release(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 delete from public.orbit_post_files f where f.id=p_id and f.owner_id=auth.uid() and f.post_id is null and f.club_post_id is null
  and not exists(select 1 from storage.objects o where o.bucket_id='orbit-post-files' and o.name=f.path);
 return jsonb_build_object('released',found);
end; $$;
create function orbit_private.file_info(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.orbit_post_files; begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 select * into f from public.orbit_post_files where id=p_id;
 if not found or not orbit_private.file_allowed(f.path,false) then raise exception 'File not found' using errcode='P0002'; end if;
 return jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',f.size,'path',f.path,'pending',f.post_id is null and f.club_post_id is null);
end; $$;

-- Internal projections never expose workspace details or private profile fields.
create function orbit_private.post_files_json(p_post uuid,p_club boolean) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'mime',mime,'size',size) order by created_at,id),'[]'::jsonb)
 from public.orbit_post_files where (not p_club and post_id=p_post) or (p_club and club_post_id=p_post);
$$;
create function orbit_private.post_stats(p_post uuid,p_club boolean) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('likeCount',(select count(*) from (
  select profile_id from public.orbit_likes where not p_club and post_id=p_post union all
  select profile_id from public.orbit_club_post_likes where p_club and post_id=p_post) l),
 'liked',exists(select 1 from public.orbit_likes where not p_club and post_id=p_post and profile_id=auth.uid()) or
  exists(select 1 from public.orbit_club_post_likes where p_club and post_id=p_post and profile_id=auth.uid()),
 'commentCount',(select count(*) from (select id from public.orbit_comments where not p_club and post_id=p_post union all
  select id from public.orbit_club_post_comments where p_club and post_id=p_post) c),
 'attachments',orbit_private.post_files_json(p_post,p_club));
$$;
create function orbit_private.post_thread(p_post uuid,p_club boolean default false,p_before uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_time timestamptz; v_comments jsonb; v_more boolean; begin
 if auth.uid() is null or not orbit_private.can_read_post(p_post,p_club) then raise exception 'Post not available' using errcode='42501'; end if;
 if p_before is not null then
  select created_at into v_time from (select id,created_at from public.orbit_comments where not p_club and post_id=p_post
   union all select id,created_at from public.orbit_club_post_comments where p_club and post_id=p_post) c where id=p_before;
  if not found then raise exception 'Comment not found' using errcode='P0002'; end if;
 end if;
 with all_comments as (select id,author_id,body,created_at from public.orbit_comments where not p_club and post_id=p_post union all
  select id,author_id,body,created_at from public.orbit_club_post_comments where p_club and post_id=p_post),
 candidates as (select * from all_comments where p_before is null or (created_at,id)<(v_time,p_before) order by created_at desc,id desc limit 21),
 page as (select * from candidates order by created_at desc,id desc limit 20)
 select coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'body',c.body,'createdAt',c.created_at,
   'author',jsonb_build_object('id',p.id,'name',p.name,'color',p.color)) order by c.created_at,c.id)
   from page c join public.orbit_profiles p on p.id=c.author_id),'[]'::jsonb),(select count(*)>20 from candidates) into v_comments,v_more;
 return orbit_private.post_stats(p_post,p_club) || jsonb_build_object('comments',v_comments,'hasMore',v_more);
end; $$;
create function orbit_private.post_respond(p_post uuid,p_club boolean,p_action jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); v_club uuid; cid uuid; existing record; begin
 if u is null then raise exception 'Sign in' using errcode='42501'; end if;
 if p_club then
  select club_id into v_club from public.orbit_club_messages where id=p_post and kind='post';
  perform 1 from public.orbit_clubs where id=v_club for update;
  perform 1 from public.orbit_club_messages where id=p_post and kind='post' for update;
 else perform 1 from public.orbit_posts where id=p_post for update; end if;
 if not orbit_private.can_read_post(p_post,p_club) then raise exception 'Post not available' using errcode='42501'; end if;
 if p_action->>'type'='like' and jsonb_typeof(p_action->'liked')='boolean' then
  if (p_action->>'liked')::boolean then
   if p_club then insert into public.orbit_club_post_likes values(p_post,u) on conflict do nothing;
   else insert into public.orbit_likes values(p_post,u) on conflict do nothing; end if;
  else
   if p_club then delete from public.orbit_club_post_likes where post_id=p_post and profile_id=u;
   else delete from public.orbit_likes where post_id=p_post and profile_id=u; end if;
  end if;
 elsif p_action->>'type'='comment' then
  cid:=(p_action->>'id')::uuid;
  if cid is null or p_action->>'body' is null or char_length(btrim(p_action->>'body')) not between 1 and 1000 then
   raise exception 'Invalid comment' using errcode='22023'; end if;
  select * into existing from (select id,post_id,author_id,body from public.orbit_comments where not p_club and id=cid union all
   select id,post_id,author_id,body from public.orbit_club_post_comments where p_club and id=cid) c;
  if found then
   if existing.post_id<>p_post or existing.author_id<>u or existing.body<>btrim(p_action->>'body') then raise exception 'Comment request conflicts' using errcode='22023'; end if;
  else
   if (select count(*) from (select id from public.orbit_comments where author_id=u and created_at>clock_timestamp()-interval '1 minute' union all
     select id from public.orbit_club_post_comments where author_id=u and created_at>clock_timestamp()-interval '1 minute') c)>=30 then
    raise exception 'Commenting too quickly' using errcode='P0001'; end if;
   if p_club then insert into public.orbit_club_post_comments(id,post_id,author_id,body) values(cid,p_post,u,btrim(p_action->>'body'));
   else insert into public.orbit_comments(id,post_id,author_id,body) values(cid,p_post,u,btrim(p_action->>'body')); end if;
  end if;
 else raise exception 'Invalid response' using errcode='22023'; end if;
 return orbit_private.post_thread(p_post,p_club);
end; $$;

create function orbit_private.publish_post(p_id uuid,p_body text,p_category text,p_files uuid[],p_club uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); target uuid:=coalesce(p_id,gen_random_uuid()); wid uuid; f public.orbit_post_files; existing record;
 actual uuid[]; file_count integer:=coalesce(cardinality(p_files),0); begin
 if u is null then raise exception 'Sign in' using errcode='42501'; end if;
 if p_body is null or char_length(btrim(p_body))>3000 or (btrim(p_body)='' and file_count=0) or file_count>4
   or (select count(distinct x) from unnest(p_files) x)<>file_count or array_position(p_files,null) is not null
   or p_category is null or p_category not in ('general','question','marketplace') then raise exception 'Invalid post' using errcode='22023'; end if;
 if p_club is not null then
  perform 1 from public.orbit_clubs where id=p_club for update;
  if not exists(select 1 from public.orbit_club_follows where club_id=p_club and profile_id=u) then raise exception 'Follow this club to post' using errcode='42501'; end if;
  select id,author_id,body,club_id,kind from public.orbit_club_messages where id=target into existing;
 else
  wid:=(orbit_private.workspace_data()->'workspace'->>'id')::uuid;
  select id,author_id,body,workspace_id,category from public.orbit_posts where id=target into existing;
 end if;
 if found then
  select coalesce(array_agg(id order by id),array[]::uuid[]) into actual from public.orbit_post_files where post_id=target or club_post_id=target;
  if existing.author_id<>u or existing.body<>btrim(p_body) or actual<>array(select x from unnest(p_files) x order by x) then raise exception 'Post request conflicts' using errcode='22023'; end if;
  if p_club is not null then
   if existing.club_id<>p_club or existing.kind<>'post' then raise exception 'Post request conflicts' using errcode='22023'; end if;
  elsif existing.workspace_id<>wid or existing.category<>p_category then raise exception 'Post request conflicts' using errcode='22023'; end if;
  return jsonb_build_object('sent',true);
 end if;
 perform 1 from public.orbit_post_files where id=any(p_files) order by id for update;
 if (select count(*) from public.orbit_post_files where id=any(p_files) and owner_id=u and post_id is null and club_post_id is null)<>file_count then
  raise exception 'Use only your own unpublished attachments' using errcode='42501'; end if;
 for f in select * from public.orbit_post_files where id=any(p_files) loop
  if not exists(select 1 from storage.objects o where o.bucket_id='orbit-post-files' and o.name=f.path
   and (o.metadata->>'size')::bigint=f.size and lower(o.metadata->>'mimetype')=f.mime) then
   raise exception 'Finish uploading your files before posting' using errcode='22023'; end if;
 end loop;
 if p_club is not null then
  if (select count(*) from public.orbit_club_messages where author_id=u and club_id=p_club and kind='post' and created_at>clock_timestamp()-interval '1 minute')>=10 then
   raise exception 'Posting too quickly' using errcode='P0001'; end if;
  insert into public.orbit_club_messages(id,club_id,author_id,body,kind) values(target,p_club,u,btrim(p_body),'post');
  update public.orbit_post_files set club_post_id=target where id=any(p_files);
 else
  insert into public.orbit_posts(id,workspace_id,author_id,body,category) values(target,wid,u,btrim(p_body),p_category);
  update public.orbit_post_files set post_id=target where id=any(p_files);
 end if;
 return jsonb_build_object('sent',true);
end; $$;

create or replace function orbit_private.profile_page(p_profile uuid,p_before uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.orbit_profiles; v_profile jsonb; v_posts jsonb:=null; v_time timestamptz; v_more boolean:=false; begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 select * into p from public.orbit_profiles where id=p_profile;
 if not found then raise exception 'Profile not found' using errcode='P0002'; end if;
 v_profile:=jsonb_build_object('id',p.id,'name',p.name,'university',p.university,'color',p.color,
 'major',case when (p.visibility->>'major')::boolean then p.major else '' end,
 'year',case when (p.visibility->>'year')::boolean then p.year else '' end,
 'graduationYear',case when (p.visibility->>'year')::boolean then p.graduation_year end,
 'bio',case when (p.visibility->>'bio')::boolean then p.bio else '' end);
 if (p.visibility->>'posts')::boolean then
  if p_before is not null then select created_at into v_time from public.orbit_posts where id=p_before and author_id=p_profile;
   if not found then raise exception 'Post not found' using errcode='P0002'; end if; end if;
  with candidates as (select * from public.orbit_posts where author_id=p_profile and (p_before is null or (created_at,id)<(v_time,p_before)) order by created_at desc,id desc limit 21),
  page as (select * from candidates order by created_at desc,id desc limit 20)
  select coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'body',x.body,'category',x.category,'createdAt',x.created_at)||orbit_private.post_stats(x.id,false) order by x.created_at desc,x.id desc) from page x),'[]'::jsonb),
   (select count(*)>20 from candidates) into v_posts,v_more;
 end if;
 return jsonb_build_object('profile',v_profile,'posts',v_posts,'hasMore',v_more);
end; $$;
create function orbit_private.club_posts(p_club uuid,p_before uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb; items jsonb; begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 v:=orbit_private.club_entries(p_club,'post',p_before);
 select coalesce(jsonb_agg(item || orbit_private.post_stats((item->>'id')::uuid,true) order by item->>'createdAt',item->>'id'),'[]'::jsonb)
  into items from jsonb_array_elements(v->'messages') item;
 return v||jsonb_build_object('messages',items);
end; $$;

create or replace function public.orbit_club_posts(p_club uuid,p_before uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select orbit_private.club_posts(p_club,p_before);
$$;

-- Preserve existing workspace/event operations while adding files to snapshots.
alter function orbit_private.get_data() rename to publishing_data;
revoke all on function orbit_private.publishing_data() from public,anon,authenticated;
create function orbit_private.get_data() returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb; items jsonb; begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 v:=orbit_private.publishing_data();
 select coalesce(jsonb_agg((item-'sharedOnProfile')||jsonb_build_object('attachments',orbit_private.post_files_json((item->>'id')::uuid,false)) order by item->>'createdAt' desc,item->>'id'),'[]'::jsonb)
  into items from jsonb_array_elements(v->'posts') item;
 return v||jsonb_build_object('posts',items);
end; $$;
alter function orbit_private.mutate(jsonb) rename to publishing_mutate;
revoke all on function orbit_private.publishing_mutate(jsonb) from public,anon,authenticated;
create function orbit_private.mutate(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 if p_action->>'type'='create_post' then
  perform orbit_private.publish_post((p_action->>'id')::uuid,p_action->>'body',p_action->>'category',
   array(select jsonb_array_elements_text(coalesce(p_action->'attachmentIds','[]'::jsonb)))::uuid[]);
  return public.orbit_get_data();
 elsif p_action->>'type'='set_post_sharing' then
  if not exists(select 1 from public.orbit_posts where id=(p_action->>'id')::uuid and author_id=auth.uid()) then raise exception 'Only the author can change sharing' using errcode='42501'; end if;
  return public.orbit_get_data();
 else return orbit_private.publishing_mutate(p_action); end if;
end; $$;

create function public.orbit_post_thread(p_post uuid,p_club boolean default false,p_before uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$ select orbit_private.post_thread(p_post,p_club,p_before); $$;
create function public.orbit_post_respond(p_post uuid,p_club boolean,p_action jsonb) returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.post_respond(p_post,p_club,p_action); $$;
create function public.orbit_club_publish(p_club uuid,p_id uuid,p_body text,p_files uuid[] default array[]::uuid[]) returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.publish_post(p_id,p_body,'general',p_files,p_club); $$;
create function public.orbit_file_reserve(p_id uuid,p_name text,p_mime text,p_size integer) returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.file_reserve(p_id,p_name,p_mime,p_size); $$;
create function public.orbit_file_release(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.file_release(p_id); $$;
create function public.orbit_file_info(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select orbit_private.file_info(p_id); $$;

revoke all on function orbit_private.post_files_json(uuid,boolean),orbit_private.post_stats(uuid,boolean) from public,anon,authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='orbit_private' and p.proname in ('can_read_post','file_allowed','file_reserve','file_release','file_info','post_thread','post_respond','publish_post','club_posts','get_data','mutate'))
 or (n.nspname='public' and p.proname in ('orbit_post_thread','orbit_post_respond','orbit_club_publish','orbit_file_reserve','orbit_file_release','orbit_file_info')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end; $$;
notify pgrst,'reload schema';
commit;
