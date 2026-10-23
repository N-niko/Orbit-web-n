begin;

-- Historical workspace posts are private until their author selects them.
alter table public.orbit_posts add column profile_shared boolean not null default false;
create index orbit_posts_profile_idx on public.orbit_posts(author_id,created_at desc,id desc) where profile_shared;
alter table public.orbit_profiles drop constraint orbit_profiles_visibility_check;
update public.orbit_profiles set visibility=visibility || '{"posts":true}'::jsonb;
alter table public.orbit_profiles alter column visibility set default '{"major":true,"year":true,"bio":true,"posts":true}'::jsonb;
alter table public.orbit_profiles add constraint orbit_profiles_visibility_check check (
  jsonb_typeof(visibility)='object' and visibility ?& array['major','year','bio','posts']
  and (visibility-array['major','year','bio','posts'])='{}'::jsonb
  and jsonb_typeof(visibility->'major')='boolean' and jsonb_typeof(visibility->'year')='boolean'
  and jsonb_typeof(visibility->'bio')='boolean' and jsonb_typeof(visibility->'posts')='boolean');

create or replace function orbit_private.set_profile_visibility(p_field text,p_visible boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to change visibility' using errcode='42501'; end if;
  if p_field is null or p_field not in ('major','year','bio','posts') or p_visible is null then
    raise exception 'Invalid visibility choice' using errcode='22023'; end if;
  update public.orbit_profiles set visibility=jsonb_set(visibility,array[p_field],to_jsonb(p_visible)) where id=auth.uid();
  if not found then raise exception 'Profile not found' using errcode='P0002'; end if;
  return public.orbit_get_data();
end; $$;

create function orbit_private.profile_page(p_profile uuid,p_before uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.orbit_profiles; v_profile jsonb; v_posts jsonb:=null; v_time timestamptz; v_more boolean:=false;
begin
  if auth.uid() is null then raise exception 'Sign in to view profiles' using errcode='42501'; end if;
  select * into p from public.orbit_profiles where id=p_profile;
  if not found then raise exception 'Profile not found' using errcode='P0002'; end if;
  v_profile:=jsonb_build_object('id',p.id,'name',p.name,'university',p.university,'color',p.color,
    'major',case when (p.visibility->>'major')::boolean then p.major else '' end,
    'year',case when (p.visibility->>'year')::boolean then p.year else '' end,
    'graduationYear',case when (p.visibility->>'year')::boolean then p.graduation_year end,
    'bio',case when (p.visibility->>'bio')::boolean then p.bio else '' end);
  if (p.visibility->>'posts')::boolean then
    if p_before is not null then
      select created_at into v_time from public.orbit_posts where id=p_before and author_id=p_profile and profile_shared;
      if not found then raise exception 'Post not found' using errcode='P0002'; end if;
    end if;
    with candidates as (select x.* from public.orbit_posts x where x.author_id=p_profile and x.profile_shared
      and (p_before is null or (x.created_at,x.id)<(v_time,p_before)) order by x.created_at desc,x.id desc limit 21),
    page as (select * from candidates order by created_at desc,id desc limit 20)
    select coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'body',x.body,'category',x.category,'createdAt',x.created_at,
      'likeCount',(select count(*) from public.orbit_likes l where l.post_id=x.id),
      'commentCount',(select count(*) from public.orbit_comments c where c.post_id=x.id)) order by x.created_at desc,x.id desc) from page x),'[]'::jsonb),
      (select count(*)>20 from candidates) into v_posts,v_more;
  end if;
  return jsonb_build_object('profile',v_profile,'posts',v_posts,'hasMore',v_more);
end; $$;
create function public.orbit_profile_page(p_profile uuid,p_before uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select orbit_private.profile_page(p_profile,p_before); $$;

-- Club posts and chat share the same protected storage and separate streams.
alter table public.orbit_club_messages add column kind text not null default 'chat' check(kind in ('chat','post'));
alter table public.orbit_club_messages drop constraint orbit_club_messages_body_check;
alter table public.orbit_club_messages add constraint orbit_club_messages_body_check check (
  char_length(btrim(body)) between 1 and case when kind='post' then 3000 else 2000 end);
create index orbit_club_entries_page_idx on public.orbit_club_messages(club_id,kind,created_at desc,id desc);

create function orbit_private.club_entries(p_club uuid,p_kind text,p_before uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_time timestamptz; v_entries jsonb; v_more boolean;
begin
  if auth.uid() is null or not exists(select 1 from public.orbit_club_follows where club_id=p_club and profile_id=auth.uid()) then
    raise exception 'Follow this club to view its activity' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('chat','post') then raise exception 'Invalid stream' using errcode='22023'; end if;
  if p_before is not null then
    select created_at into v_time from public.orbit_club_messages where id=p_before and club_id=p_club and kind=p_kind;
    if not found then raise exception 'Entry not found' using errcode='P0002'; end if;
  end if;
  with candidates as (select m.* from public.orbit_club_messages m where m.club_id=p_club and m.kind=p_kind
    and (p_before is null or (m.created_at,m.id)<(v_time,p_before)) order by m.created_at desc,m.id desc limit 51),
  page as (select * from candidates order by created_at desc,id desc limit 50)
  select coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'createdAt',m.created_at,
    'author',jsonb_build_object('id',p.id,'name',p.name,'color',p.color)) order by m.created_at,m.id)
    from page m join public.orbit_profiles p on p.id=m.author_id),'[]'::jsonb),
    (select count(*)>50 from candidates) into v_entries,v_more;
  return jsonb_build_object('messages',v_entries,'hasMore',v_more);
end; $$;
create function orbit_private.club_write(p_club uuid,p_kind text,p_id uuid,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_existing public.orbit_club_messages; v_limit integer;
begin
  if v_uid is null then raise exception 'Sign in to post' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('chat','post') or p_id is null or p_body is null
    or char_length(btrim(p_body)) not between 1 and (case when p_kind='post' then 3000 else 2000 end) then
    raise exception 'Check your message' using errcode='22023'; end if;
  perform 1 from public.orbit_clubs where id=p_club for update;
  if not found then raise exception 'Club not found' using errcode='P0002'; end if;
  if not exists(select 1 from public.orbit_club_follows where club_id=p_club and profile_id=v_uid) then
    raise exception 'Follow this club to post' using errcode='42501'; end if;
  select * into v_existing from public.orbit_club_messages where id=p_id;
  if found then
    if v_existing.author_id<>v_uid or v_existing.club_id<>p_club or v_existing.kind<>p_kind or v_existing.body<>btrim(p_body) then
      raise exception 'Entry request conflicts with an existing entry' using errcode='22023'; end if;
    return jsonb_build_object('sent',true);
  end if;
  v_limit:=case when p_kind='post' then 10 else 30 end;
  if (select count(*) from public.orbit_club_messages where author_id=v_uid and club_id=p_club and kind=p_kind
    and created_at>clock_timestamp()-interval '1 minute')>=v_limit then
    raise exception 'Posting too quickly' using errcode='P0001'; end if;
  insert into public.orbit_club_messages(id,club_id,author_id,body,kind) values(p_id,p_club,v_uid,btrim(p_body),p_kind);
  return jsonb_build_object('sent',true);
end; $$;
create or replace function orbit_private.club_messages(p_club uuid,p_before uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
  if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
  return orbit_private.club_entries(p_club,'chat',p_before); end; $$;
create or replace function orbit_private.club_send(p_club uuid,p_id uuid,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
  return orbit_private.club_write(p_club,'chat',p_id,p_body); end; $$;
create function public.orbit_club_posts(p_club uuid,p_before uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select orbit_private.club_entries(p_club,'post',p_before); $$;
create function public.orbit_club_post(p_club uuid,p_id uuid,p_body text) returns jsonb
language sql security invoker set search_path='' as $$ select orbit_private.club_write(p_club,'post',p_id,p_body); $$;

alter table public.orbit_events alter column workspace_id drop not null;
alter table public.orbit_events add column club_id uuid references public.orbit_clubs(id) on delete cascade;
alter table public.orbit_events add constraint orbit_event_audience check ((workspace_id is null)<>(club_id is null));
create index orbit_events_club_idx on public.orbit_events(club_id,starts_at);
drop policy orbit_events_read on public.orbit_events;
create policy orbit_events_read on public.orbit_events for select to authenticated using (
  public._orbit_is_member(workspace_id) or exists(select 1 from public.orbit_club_follows f where f.club_id=orbit_events.club_id and f.profile_id=(select auth.uid())));
create table public.orbit_event_choices (
  event_id uuid not null references public.orbit_events(id) on delete cascade,
  profile_id uuid not null references public.orbit_profiles(id) on delete cascade,
  response text not null check(response in ('going','not_going')),
  removed boolean not null default false check(not removed or response='not_going'),
  primary key(event_id,profile_id)
);
create index orbit_event_choices_profile_idx on public.orbit_event_choices(profile_id,event_id);
alter table public.orbit_event_choices enable row level security;
revoke all on public.orbit_event_choices from public,anon,authenticated;
grant select on public.orbit_event_choices to authenticated;
create policy orbit_event_choices_read on public.orbit_event_choices for select to authenticated using(profile_id=(select auth.uid()));

create function orbit_private.event_json(p_event uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'location',e.location,
    'startsAt',e.starts_at,'category',e.category,'cover',e.cover,'host',e.host_id,'hostName',p.name,
    'clubId',e.club_id,'clubName',c.name,'attendeeCount',(select count(*) from public.orbit_rsvps r where r.event_id=e.id),
    'attendees',coalesce((select jsonb_agg(r.profile_id order by r.profile_id) from public.orbit_rsvps r
      where r.event_id=e.id and (e.club_id is null or r.profile_id=auth.uid())),'[]'::jsonb),
    'response',case when exists(select 1 from public.orbit_rsvps r where r.event_id=e.id and r.profile_id=auth.uid()) then 'going'
      when choice.response='not_going' then 'not_going' end,'removed',coalesce(choice.removed,false))
  from public.orbit_events e join public.orbit_profiles p on p.id=e.host_id left join public.orbit_clubs c on c.id=e.club_id
  left join public.orbit_event_choices choice on choice.event_id=e.id and choice.profile_id=auth.uid() where e.id=p_event;
$$;
revoke all on function orbit_private.event_json(uuid) from public,anon,authenticated;

-- Keep the proven workspace operations private and enrich their snapshots centrally.
alter function public.orbit_get_data() set schema orbit_private;
alter function orbit_private.orbit_get_data() rename to workspace_data;
revoke all on function orbit_private.workspace_data() from public,anon,authenticated;
create function orbit_private.get_data() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb; v_events jsonb; v_posts jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
  v:=orbit_private.workspace_data();
  select coalesce(jsonb_agg(orbit_private.event_json(e.id) order by e.starts_at,e.id),'[]'::jsonb) into v_events
    from public.orbit_events e where e.workspace_id=(v->'workspace'->>'id')::uuid
      or exists(select 1 from public.orbit_club_follows f where f.club_id=e.club_id and f.profile_id=auth.uid());
  select coalesce(jsonb_agg(item || jsonb_build_object('sharedOnProfile',p.profile_shared) order by p.created_at desc,p.id),'[]'::jsonb)
    into v_posts from jsonb_array_elements(v->'posts') item join public.orbit_posts p on p.id=(item->>'id')::uuid;
  return v || jsonb_build_object('events',v_events,'posts',v_posts);
end; $$;
create function public.orbit_get_data() returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.get_data(); $$;

alter function public.orbit_mutate(jsonb) set schema orbit_private;
alter function orbit_private.orbit_mutate(jsonb) rename to workspace_mutate;
revoke all on function orbit_private.workspace_mutate(jsonb) from public,anon,authenticated;
create function orbit_private.mutate(p_action jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); v jsonb; e public.orbit_events; c public.orbit_clubs; t text:=p_action->>'type';
  target uuid; club uuid; state text; v_shared boolean; start_time timestamptz;
begin
  if u is null then raise exception 'Sign in' using errcode='42501'; end if;
  if jsonb_typeof(p_action) is distinct from 'object' then raise exception 'Invalid action' using errcode='22023'; end if;
  if t='create_post' then
    v:=public.orbit_get_data();
    if nullif(btrim(p_action->>'body'),'') is null or char_length(btrim(p_action->>'body'))>3000
      or p_action->>'category' is null or p_action->>'category' not in ('general','question','marketplace')
      or (p_action ? 'shareOnProfile' and jsonb_typeof(p_action->'shareOnProfile')<>'boolean') then
      raise exception 'Invalid post' using errcode='22023'; end if;
    v_shared:=coalesce((p_action->>'shareOnProfile')::boolean,false);
    insert into public.orbit_posts(workspace_id,author_id,body,category,profile_shared)
      values((v->'workspace'->>'id')::uuid,u,btrim(p_action->>'body'),p_action->>'category',v_shared);
  elsif t='set_post_sharing' then
    if jsonb_typeof(p_action->'shared') is distinct from 'boolean' then raise exception 'Invalid sharing choice' using errcode='22023'; end if;
    update public.orbit_posts set profile_shared=(p_action->>'shared')::boolean where id=(p_action->>'id')::uuid and author_id=u;
    if not found then raise exception 'Only the author can change sharing' using errcode='42501'; end if;
  elsif t='create_club_event' then
    club:=(p_action->>'clubId')::uuid; target:=(p_action->>'id')::uuid;
    select * into c from public.orbit_clubs where id=club for update;
    if not found or c.created_by<>u or not exists(select 1 from public.orbit_club_follows where club_id=club and profile_id=u) then
      raise exception 'Only the club owner can create events' using errcode='42501'; end if;
    start_time:=(p_action->>'startsAt')::timestamptz;
    if target is null or nullif(btrim(p_action->>'title'),'') is null or char_length(btrim(p_action->>'title'))>160
      or nullif(btrim(p_action->>'location'),'') is null or char_length(btrim(p_action->>'location'))>160
      or p_action->>'description' is null or char_length(p_action->>'description')>3000
      or start_time is null or start_time<=now() or p_action->>'cover' is null or p_action->>'cover' not in ('violet','peach','green','blue') then
      raise exception 'Check event details and choose a future date' using errcode='22023'; end if;
    select * into e from public.orbit_events where id=target;
    if found then
      if e.club_id is distinct from club or e.host_id<>u or e.title<>btrim(p_action->>'title') or e.description<>btrim(p_action->>'description')
        or e.location<>btrim(p_action->>'location') or e.starts_at<>start_time or e.cover<>p_action->>'cover' then
        raise exception 'Event request conflicts' using errcode='22023'; end if;
    else
      if (select count(*) from public.orbit_events where club_id=club and created_at>now()-interval '1 day')>=20 then
        raise exception 'Event creation limit reached' using errcode='P0004'; end if;
      insert into public.orbit_events(id,club_id,host_id,title,description,location,starts_at,category,cover)
        values(target,club,u,btrim(p_action->>'title'),btrim(p_action->>'description'),btrim(p_action->>'location'),start_time,'Clubs',p_action->>'cover');
    end if;
  elsif t in ('respond_event','remove_event','restore_event','toggle_rsvp') then
    target:=(p_action->>'id')::uuid;
    select * into e from public.orbit_events where id=target;
    if not found then raise exception 'Event not found' using errcode='P0002'; end if;
    if e.club_id is not null then perform 1 from public.orbit_clubs where id=e.club_id for update; end if;
    perform 1 from public.orbit_events where id=target for update;
    if not public._orbit_is_member(e.workspace_id) and not exists(select 1 from public.orbit_club_follows where club_id=e.club_id and profile_id=u) then
      raise exception 'Event not found' using errcode='P0002'; end if;
    if t='remove_event' then
      update public.orbit_event_choices set removed=true where event_id=target and profile_id=u and response='not_going';
      if not found then raise exception 'Choose Not going before removing an event' using errcode='22023'; end if;
    elsif t='restore_event' then
      update public.orbit_event_choices set removed=false where event_id=target and profile_id=u;
    else
      state:=case when t='toggle_rsvp' then case when exists(select 1 from public.orbit_rsvps where event_id=target and profile_id=u) then 'not_going' else 'going' end else p_action->>'response' end;
      if state is null or state not in ('going','not_going') then raise exception 'Invalid event response' using errcode='22023'; end if;
      if state='going' then
        if e.starts_at<now() and not exists(select 1 from public.orbit_rsvps where event_id=target and profile_id=u) then
          raise exception 'Event has ended' using errcode='22023'; end if;
        insert into public.orbit_rsvps(event_id,profile_id) values(target,u) on conflict do nothing;
      else delete from public.orbit_rsvps where event_id=target and profile_id=u; end if;
      insert into public.orbit_event_choices(event_id,profile_id,response,removed) values(target,u,state,false)
        on conflict(event_id,profile_id) do update set response=excluded.response,removed=false;
    end if;
  else return orbit_private.workspace_mutate(p_action);
  end if;
  return public.orbit_get_data();
end; $$;
create function public.orbit_mutate(p_action jsonb) returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.mutate(p_action); $$;

do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='orbit_private' and p.proname in ('profile_page','club_entries','club_write','get_data','mutate'))
      or (n.nspname='public' and p.proname in ('orbit_profile_page','orbit_club_posts','orbit_club_post','orbit_get_data','orbit_mutate'))
  loop
    execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
    execute format('grant execute on function %s to authenticated',fn.signature);
  end loop;
end; $$;
notify pgrst,'reload schema';
commit;
