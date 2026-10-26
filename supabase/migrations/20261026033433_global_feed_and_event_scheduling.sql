begin;

-- Existing posts keep the previous workspace/profile rules. Only new social posts use an explicit audience.
alter table public.orbit_posts alter column workspace_id drop not null;
alter table public.orbit_posts add column audience text not null default 'legacy' check(audience in ('legacy','public','followers'));
alter table public.orbit_posts add constraint orbit_posts_scope check(audience<>'legacy' or workspace_id is not null);
create index orbit_posts_feed_idx on public.orbit_posts(created_at desc,id desc);
create index orbit_posts_social_audience_idx on public.orbit_posts(audience,created_at desc,id desc) where audience<>'legacy';

create or replace function orbit_private.can_read_post(p_post uuid,p_club boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null or p_club is null then return false; end if;
 if p_club then return exists(select 1 from public.orbit_club_messages m join public.orbit_club_follows f on f.club_id=m.club_id
  where m.id=p_post and m.kind='post' and f.profile_id=auth.uid()); end if;
 return exists(select 1 from public.orbit_posts p join public.orbit_profiles a on a.id=p.author_id where p.id=p_post and (
  p.author_id=auth.uid() or p.audience='public' or (p.audience='followers' and exists(select 1 from public.orbit_user_follows f where f.follower_id=auth.uid() and f.followed_id=p.author_id))
  or (p.audience='legacy' and (public._orbit_is_member(p.workspace_id) or coalesce((a.visibility->>'posts')::boolean,false)))));
end; $$;
-- Raw legacy rows still never expose workspace identifiers to profile visitors.
drop policy orbit_posts_read on public.orbit_posts;
create policy orbit_posts_read on public.orbit_posts for select to authenticated using(
 author_id=(select auth.uid()) or (audience='legacy' and public._orbit_is_member(workspace_id)) or (audience<>'legacy' and orbit_private.can_read_post(id,false)));
drop policy orbit_likes_read on public.orbit_likes;
create policy orbit_likes_read on public.orbit_likes for select to authenticated using(orbit_private.can_read_post(post_id,false));
drop policy orbit_comments_read on public.orbit_comments;
create policy orbit_comments_read on public.orbit_comments for select to authenticated using(orbit_private.can_read_post(post_id,false));

alter function orbit_private.publish_post(uuid,text,text,uuid[],uuid) rename to validated_publish_post;
revoke all on function orbit_private.validated_publish_post(uuid,text,text,uuid[],uuid) from public,anon,authenticated;
-- The existing club entry point still performs membership and attachment ownership checks.
create function orbit_private.legacy_publish_post(p_id uuid,p_body text,p_category text,p_files uuid[],p_club uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or p_club is null then raise exception 'Use the social publisher' using errcode='42501'; end if;
 return orbit_private.validated_publish_post(p_id,p_body,p_category,p_files,p_club);
end; $$;
create or replace function public.orbit_club_publish(p_club uuid,p_id uuid,p_body text,p_files uuid[] default array[]::uuid[]) returns jsonb language sql security invoker set search_path='' as $$
 select orbit_private.legacy_publish_post(p_id,p_body,'general',p_files,p_club); $$;

create function orbit_private.publish_social_post(p_id uuid,p_body text,p_audience text,p_files uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare existing public.orbit_posts; target uuid:=coalesce(p_id,gen_random_uuid()); actual uuid[]; begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 if p_audience is null or p_audience not in ('public','followers') then raise exception 'Invalid audience' using errcode='22023'; end if;
 -- Serialize publication/retries per author, including requests that race before an ID exists.
 perform 1 from public.orbit_profiles where id=auth.uid() for update;
 select * into existing from public.orbit_posts where id=target;
 if found then
  select coalesce(array_agg(id order by id),array[]::uuid[]) into actual from public.orbit_post_files where post_id=target;
  if existing.author_id<>auth.uid() or existing.body is distinct from btrim(p_body) or existing.audience<>p_audience or actual is distinct from array(select x from unnest(p_files) x order by x) then raise exception 'Post request conflicts' using errcode='22023'; end if;
  return;
 end if;
 if (select count(*) from public.orbit_posts where author_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=10 then raise exception 'Posting too quickly' using errcode='P0001'; end if;
 perform orbit_private.validated_publish_post(target,p_body,'general',p_files,null);
 update public.orbit_posts set workspace_id=null,audience=p_audience where id=target;
end; $$;

-- Event timestamps are UTC instants (timestamptz). Legacy end times remain NULL; every reader uses +2 hours.
alter table public.orbit_events add column ends_at timestamptz;
alter table public.orbit_events add column audience text not null default 'workspace' check(audience in ('workspace','public','club'));
update public.orbit_events set audience='club' where club_id is not null;
alter table public.orbit_events drop constraint orbit_event_audience;
alter table public.orbit_events add constraint orbit_event_audience check(
 (audience='public' and workspace_id is null and club_id is null) or (audience='workspace' and workspace_id is not null and club_id is null) or (audience='club' and workspace_id is null and club_id is not null));
alter table public.orbit_events add constraint orbit_event_schedule check(ends_at is null or (isfinite(ends_at) and ends_at>starts_at));
create index orbit_events_public_time_idx on public.orbit_events(starts_at,id) where audience='public';
create index orbit_events_end_idx on public.orbit_events(ends_at,id) where ends_at is not null;
create index orbit_events_feed_idx on public.orbit_events(created_at desc,id desc) where audience='club';
create index orbit_events_host_idx on public.orbit_events(host_id,starts_at,id);

create function orbit_private.event_status(p_start timestamptz,p_end timestamptz,p_now timestamptz default now()) returns text language sql immutable set search_path='' as $$
 select case when p_now>=coalesce(p_end,p_start+interval '2 hours') then 'past' when p_now<p_start then 'upcoming' else 'in_progress' end; $$;
create function orbit_private.can_read_event(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.orbit_events e where e.id=p_id and (
 e.audience='public' or (e.audience='workspace' and (e.host_id=auth.uid() or public._orbit_is_member(e.workspace_id)))
 or (e.audience='club' and exists(select 1 from public.orbit_club_follows f where f.club_id=e.club_id and f.profile_id=auth.uid())))); $$;
drop policy orbit_events_read on public.orbit_events;
create policy orbit_events_read on public.orbit_events for select to authenticated using(orbit_private.can_read_event(id));
drop policy orbit_rsvps_read on public.orbit_rsvps;
create policy orbit_rsvps_read on public.orbit_rsvps for select to authenticated using(profile_id=(select auth.uid()) and orbit_private.can_read_event(event_id));
create or replace function orbit_private.event_json(p_event uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'location',e.location,'createdAt',e.created_at,
 'startsAt',e.starts_at,'endsAt',e.ends_at,'audience',e.audience,'category',e.category,'cover',e.cover,'host',e.host_id,'hostName',p.name,
 'clubId',e.club_id,'clubName',c.name,'clubColor',c.color,
 'followingHost',exists(select 1 from public.orbit_user_follows f where f.follower_id=auth.uid() and f.followed_id=e.host_id),
 'attendeeCount',(select count(*) from public.orbit_rsvps r where r.event_id=e.id),
 'attendees',coalesce((select jsonb_agg(r.profile_id) from public.orbit_rsvps r where r.event_id=e.id and r.profile_id=auth.uid()),'[]'::jsonb),
 'response',case when exists(select 1 from public.orbit_rsvps r where r.event_id=e.id and r.profile_id=auth.uid()) then 'going' when choice.response='not_going' then 'not_going' end,
 'removed',coalesce(choice.removed,false))
 from public.orbit_events e join public.orbit_profiles p on p.id=e.host_id left join public.orbit_clubs c on c.id=e.club_id
 left join public.orbit_event_choices choice on choice.event_id=e.id and choice.profile_id=auth.uid() where e.id=p_event; $$;

create function orbit_private.social_post_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'author',orbit_private.social_person(p.author_id),'body',p.body,'createdAt',p.created_at,'audience',p.audience)||orbit_private.post_stats(p.id,false)
 from public.orbit_posts p where p.id=p_id; $$;
create function orbit_private.home_feed(p_before timestamptz default null,p_id uuid default null,p_kind text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb; cursor jsonb; more boolean; begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 if (p_before is null)<>(p_id is null) or (p_before is null)<>(p_kind is null) or (p_kind is not null and p_kind not in ('post','event')) then raise exception 'Invalid cursor' using errcode='22023'; end if;
 with posts as (select id,created_at,'post'::text kind from public.orbit_posts p where orbit_private.can_read_post(p.id,false)
  and (p_before is null or (created_at,id,'post'::text)<(p_before,p_id,p_kind)) order by created_at desc,id desc limit 9),
 events as (select id,created_at,'event'::text kind from public.orbit_events e where e.audience='club' and orbit_private.can_read_event(e.id)
  and not exists(select 1 from public.orbit_event_choices c where c.event_id=e.id and c.profile_id=auth.uid() and c.removed)
  and (p_before is null or (created_at,id,'event'::text)<(p_before,p_id,p_kind)) order by created_at desc,id desc limit 9),
 candidates as(select * from posts union all select * from events), page as(select * from candidates order by created_at desc,id desc,kind desc limit 8)
 select coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'id',id,'publishedAt',created_at,
 'post',case when kind='post' then orbit_private.social_post_json(id) end,'event',case when kind='event' then orbit_private.event_json(id) end) order by created_at desc,id desc,kind desc) from page),'[]'::jsonb),
 (select jsonb_build_object('publishedAt',created_at,'id',id,'kind',kind) from page order by created_at,id,kind limit 1),
 (select count(*)>8 from candidates) into items,cursor,more;
 return jsonb_build_object('items',items,'nextCursor',case when more then cursor end,'hasMore',more);
end; $$;
create function public.orbit_home_feed(p_before timestamptz default null,p_id uuid default null,p_kind text default null) returns jsonb language sql stable security invoker set search_path='' as $$ select orbit_private.home_feed(p_before,p_id,p_kind); $$;

-- Keep workspace collaboration separate; do not load its historical posts/comments into every poll.
create or replace function orbit_private.workspace_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_workspace uuid; v_metadata jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select raw_user_meta_data into v_metadata from auth.users where id = v_uid;
  if not found then raise exception 'Authentication required' using errcode = '42501'; end if;
  v_workspace := public._orbit_initialize_user(v_uid, v_metadata->>'name', v_metadata->>'university');
  if not public._orbit_is_member(v_workspace) then raise exception 'Workspace access denied' using errcode = '42501'; end if;

  return jsonb_build_object(
    'profile', public._orbit_profile_json(v_uid),
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name, 'inviteCode', w.invite_code, 'members',
      coalesce((select jsonb_agg(public._orbit_profile_json(m.profile_id) order by m.joined_at, m.profile_id) from public.orbit_memberships m where m.workspace_id = w.id), '[]'::jsonb)) from public.orbit_workspaces w where w.id = v_workspace),
    'posts','[]'::jsonb,
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'assignee', t.assignee_id, 'dueDate', t.due_date, 'completed', t.completed, 'kind', t.kind) order by t.created_at desc, t.id) from public.orbit_tasks t where t.workspace_id = v_workspace), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'amount', e.amount, 'paidBy', e.paid_by_id, 'createdAt', e.created_at) order by e.created_at desc, e.id) from public.orbit_expenses e where e.workspace_id = v_workspace), '[]'::jsonb),
    'events','[]'::jsonb
  );
end;
$$;


create or replace function orbit_private.get_data() returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb; events jsonb; begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 v:=orbit_private.workspace_data();
 select coalesce(jsonb_agg(orbit_private.event_json(e.id) order by e.starts_at,e.id),'[]'::jsonb) into events from public.orbit_events e where orbit_private.can_read_event(e.id);
 return v||jsonb_build_object('profile',v->'profile'||jsonb_build_object('postCount',(select count(*) from public.orbit_posts where author_id=auth.uid())),'events',events,'feed',orbit_private.home_feed());
end; $$;

create or replace function orbit_private.profile_page(p_profile uuid,p_before uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.orbit_profiles; person jsonb; items jsonb; stamp timestamptz; more boolean; begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501'; end if;
 select * into p from public.orbit_profiles where id=p_profile;
 if not found then raise exception 'Profile not found' using errcode='P0002'; end if;
 person:=orbit_private.social_person(p_profile)||jsonb_build_object(
 'major',case when (p.visibility->>'major')::boolean then p.major else '' end,
 'year',case when (p.visibility->>'year')::boolean then p.year else '' end,
 'graduationYear',case when (p.visibility->>'year')::boolean then p.graduation_year end,
 'bio',case when (p.visibility->>'bio')::boolean then p.bio else '' end);
 if p_before is not null then
  select created_at into stamp from public.orbit_posts where id=p_before and author_id=p_profile and orbit_private.can_read_post(id,false)
   and (audience<>'legacy' or auth.uid()=p_profile or (p.visibility->>'posts')::boolean);
  if not found then raise exception 'Post not found' using errcode='P0002'; end if;
 end if;
 with candidates as(select x.* from public.orbit_posts x where x.author_id=p_profile and orbit_private.can_read_post(x.id,false)
  and (x.audience<>'legacy' or auth.uid()=p_profile or (p.visibility->>'posts')::boolean)
  and (p_before is null or (x.created_at,x.id)<(stamp,p_before)) order by x.created_at desc,x.id desc limit 21),
 page as(select * from candidates order by created_at desc,id desc limit 20)
 select coalesce((select jsonb_agg((orbit_private.social_post_json(id)-'author')||jsonb_build_object('category',category) order by created_at desc,id desc) from page),'[]'::jsonb),
 (select count(*)>20 from candidates) into items,more;
 return jsonb_build_object('profile',person,'posts',items,'hasMore',more);
end; $$;

-- Intercept social/event actions; reuse the existing workspace operations for tasks, expenses and membership.
create or replace function orbit_private.mutate(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); t text:=p_action->>'type'; target uuid; club uuid; e public.orbit_events; state text; start_time timestamptz; end_time timestamptz; begin
 if u is null then raise exception 'Sign in' using errcode='42501'; end if;
 if jsonb_typeof(p_action) is distinct from 'object' then raise exception 'Invalid action' using errcode='22023'; end if;
 if t='create_post' then
  perform orbit_private.publish_social_post((p_action->>'id')::uuid,p_action->>'body',coalesce(p_action->>'audience','public'),array(select jsonb_array_elements_text(coalesce(p_action->'attachmentIds','[]'::jsonb)))::uuid[]);
 elsif t='toggle_like' then
  target:=(p_action->>'id')::uuid;
  perform orbit_private.post_respond(target,false,jsonb_build_object('type','like','liked',not exists(select 1 from public.orbit_likes where post_id=target and profile_id=u)));
 elsif t='add_comment' then
  perform orbit_private.post_respond((p_action->>'id')::uuid,false,jsonb_build_object('type','comment','id',gen_random_uuid(),'body',p_action->>'body'));
 elsif t in ('create_event','create_club_event','edit_event_schedule') then
  start_time:=(p_action->>'startsAt')::timestamptz; end_time:=(p_action->>'endsAt')::timestamptz;
  if start_time is null or end_time is null or not isfinite(start_time) or not isfinite(end_time) or end_time<=start_time then raise exception 'End must follow start' using errcode='22023'; end if;
  target:=coalesce((p_action->>'id')::uuid,gen_random_uuid());
  if t='edit_event_schedule' then
   select * into e from public.orbit_events where id=target for update;
   if not found or e.host_id<>u or not orbit_private.can_read_event(target) then raise exception 'Only the event creator can edit its schedule' using errcode='42501'; end if;
   update public.orbit_events set starts_at=start_time,ends_at=end_time where id=target;
  else
   if start_time<=now() or nullif(btrim(p_action->>'title'),'') is null or char_length(btrim(p_action->>'title'))>160 or nullif(btrim(p_action->>'location'),'') is null or char_length(btrim(p_action->>'location'))>160
    or p_action->>'description' is null or char_length(p_action->>'description')>3000 or p_action->>'cover' is null or p_action->>'cover' not in ('violet','peach','green','blue')
    or (t='create_event' and (p_action->>'category' is null or p_action->>'category' not in ('Social','Academic','Clubs','Wellness'))) then raise exception 'Check event details' using errcode='22023'; end if;
   if t='create_club_event' then
    club:=(p_action->>'clubId')::uuid;
    perform 1 from public.orbit_clubs where id=club and created_by=u for update;
    if not found or not exists(select 1 from public.orbit_club_follows where club_id=club and profile_id=u) then raise exception 'Only the club owner can create events' using errcode='42501'; end if;
   end if;
   perform 1 from public.orbit_profiles where id=u for update;
   select * into e from public.orbit_events where id=target;
   if found then
    if e.host_id<>u or e.club_id is distinct from club or e.audience<>(case when club is null then 'public' else 'club' end) or e.title<>btrim(p_action->>'title') or e.description<>btrim(p_action->>'description') or e.location<>btrim(p_action->>'location') or e.starts_at<>start_time or e.ends_at is distinct from end_time or e.cover<>p_action->>'cover' then raise exception 'Event request conflicts' using errcode='22023'; end if;
   else
    if (select count(*) from public.orbit_events where host_id=u and created_at>now()-interval '1 day')>=20 then raise exception 'Event creation limit reached' using errcode='P0004'; end if;
    insert into public.orbit_events(id,host_id,club_id,audience,title,description,location,starts_at,ends_at,category,cover)
     values(target,u,club,case when club is null then 'public' else 'club' end,btrim(p_action->>'title'),btrim(p_action->>'description'),btrim(p_action->>'location'),start_time,end_time,case when club is null then p_action->>'category' else 'Clubs' end,p_action->>'cover');
   end if;
  end if;
 elsif t in ('respond_event','toggle_rsvp','remove_event','restore_event') then
  target:=(p_action->>'id')::uuid;
  -- Read the row after acquiring its lock so schedule edits and RSVP decisions agree.
  select * into e from public.orbit_events where id=target for update;
  if not found or not orbit_private.can_read_event(target) then raise exception 'Event not found' using errcode='P0002'; end if;
  if t='remove_event' then
   update public.orbit_event_choices set removed=true where event_id=target and profile_id=u and response='not_going';
   if not found then raise exception 'Choose Not going first' using errcode='22023'; end if;
  elsif t='restore_event' then update public.orbit_event_choices set removed=false where event_id=target and profile_id=u;
  else
   if orbit_private.event_status(e.starts_at,e.ends_at,clock_timestamp())='past' then raise exception 'This event has ended' using errcode='P0006'; end if;
   state:=case when t='toggle_rsvp' then case when exists(select 1 from public.orbit_rsvps where event_id=target and profile_id=u) then 'not_going' else 'going' end else p_action->>'response' end;
   if state is null or state not in ('going','not_going') then raise exception 'Invalid event response' using errcode='22023'; end if;
   if state='going' then insert into public.orbit_rsvps(event_id,profile_id) values(target,u) on conflict do nothing;
   else delete from public.orbit_rsvps where event_id=target and profile_id=u; end if;
   insert into public.orbit_event_choices(event_id,profile_id,response,removed) values(target,u,state,false) on conflict(event_id,profile_id) do update set response=excluded.response,removed=false;
  end if;
 else return orbit_private.publishing_mutate(p_action); end if;
 return public.orbit_get_data();
end; $$;

-- New functions have no default PUBLIC execution, and privileged implementations stay outside public.
revoke all on function orbit_private.publish_social_post(uuid,text,text,uuid[]),orbit_private.social_post_json(uuid),orbit_private.event_status(timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function orbit_private.home_feed(timestamptz,uuid,text),orbit_private.can_read_event(uuid),orbit_private.legacy_publish_post(uuid,text,text,uuid[],uuid),public.orbit_home_feed(timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function orbit_private.home_feed(timestamptz,uuid,text),orbit_private.can_read_event(uuid),orbit_private.legacy_publish_post(uuid,text,text,uuid[],uuid),public.orbit_home_feed(timestamptz,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
