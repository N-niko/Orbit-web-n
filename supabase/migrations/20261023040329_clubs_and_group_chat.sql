begin;

create table public.orbit_clubs (
  id uuid primary key,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  category text not null check (category in ('Academic','Arts & creativity','Technology & learning','Sports & wellness','Culture & community','Service','Other')),
  meeting text not null default '' check (char_length(meeting) <= 240),
  color text not null default 'violet' check (color in ('violet','peach','green','blue')),
  created_by uuid not null references public.orbit_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index orbit_clubs_name_idx on public.orbit_clubs(lower(btrim(name)));
create index orbit_clubs_creator_idx on public.orbit_clubs(created_by,created_at desc);
create table public.orbit_club_follows (
  club_id uuid not null references public.orbit_clubs(id) on delete cascade,
  profile_id uuid not null references public.orbit_profiles(id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key(club_id,profile_id)
);
create index orbit_club_follows_profile_idx on public.orbit_club_follows(profile_id,club_id);
create table public.orbit_club_messages (
  id uuid primary key,
  club_id uuid not null references public.orbit_clubs(id) on delete cascade,
  author_id uuid not null references public.orbit_profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);
create index orbit_club_messages_page_idx on public.orbit_club_messages(club_id,created_at desc,id desc);
create index orbit_club_messages_author_idx on public.orbit_club_messages(author_id,club_id,created_at desc);

alter table public.orbit_clubs enable row level security;
alter table public.orbit_club_follows enable row level security;
alter table public.orbit_club_messages enable row level security;
revoke all on public.orbit_clubs, public.orbit_club_follows, public.orbit_club_messages from public, anon, authenticated;
grant select on public.orbit_clubs, public.orbit_club_follows, public.orbit_club_messages to authenticated;
create policy orbit_clubs_read on public.orbit_clubs for select to authenticated using ((select auth.uid()) is not null);
create policy orbit_club_follows_read on public.orbit_club_follows for select to authenticated using (profile_id=(select auth.uid()));
create policy orbit_club_messages_read on public.orbit_club_messages for select to authenticated using (
  exists(select 1 from public.orbit_club_follows f where f.club_id=orbit_club_messages.club_id and f.profile_id=(select auth.uid()))
);

-- Internal projections execute only inside the authenticated, checked entry points.
create function orbit_private.club_summary(p_club uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'category',c.category,
    'meeting',c.meeting,'color',c.color,'createdBy',c.created_by,'createdAt',c.created_at,
    'followerCount',(select count(*) from public.orbit_club_follows f where f.club_id=c.id),
    'following',exists(select 1 from public.orbit_club_follows f where f.club_id=c.id and f.profile_id=auth.uid()))
  from public.orbit_clubs c where c.id=p_club;
$$;
revoke all on function orbit_private.club_summary(uuid) from public,anon,authenticated;

create function orbit_private.clubs_list(p_query text default '',p_category text default '',p_following boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_results jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to explore clubs' using errcode='42501'; end if;
  if p_query is null or char_length(p_query)>100 or p_category is null or p_following is null then
    raise exception 'Invalid club filters' using errcode='22023'; end if;
  select coalesce(jsonb_agg(orbit_private.club_summary(c.id) order by c.name,c.id),'[]'::jsonb) into v_results
  from (select c.* from public.orbit_clubs c
    where (p_category='' or c.category=p_category)
      and (not p_following or exists(select 1 from public.orbit_club_follows f where f.club_id=c.id and f.profile_id=auth.uid()))
      and not exists(select 1 from unnest(regexp_split_to_array(lower(btrim(p_query)),'[[:space:]]+')) word
        where strpos(lower(c.name || ' ' || c.description || ' ' || c.category),word)=0)
    order by c.name,c.id limit 100) c;
  return jsonb_build_object('clubs',v_results);
end; $$;

create function orbit_private.club_get(p_club uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_club jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to open a club' using errcode='42501'; end if;
  v_club:=orbit_private.club_summary(p_club);
  if v_club is null then raise exception 'Club not found' using errcode='P0002'; end if;
  return v_club;
end; $$;

create function orbit_private.club_create(p_id uuid,p_name text,p_description text,p_category text,p_meeting text,p_color text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_existing public.orbit_clubs;
begin
  if v_uid is null then raise exception 'Sign in to create a club' using errcode='42501'; end if;
  perform 1 from public.orbit_profiles where id=v_uid for update;
  if not found then raise exception 'Complete your profile first' using errcode='42501'; end if;
  if p_id is null or p_name is null or char_length(btrim(p_name)) not between 2 and 80
    or p_description is null or char_length(btrim(p_description)) not between 1 and 2000
    or p_category is null or p_category not in ('Academic','Arts & creativity','Technology & learning','Sports & wellness','Culture & community','Service','Other')
    or p_meeting is null or char_length(p_meeting)>240 or p_color is null or p_color not in ('violet','peach','green','blue') then
    raise exception 'Check your club details' using errcode='22023'; end if;
  select * into v_existing from public.orbit_clubs where id=p_id;
  if found then
    if v_existing.created_by=v_uid and v_existing.name=btrim(p_name) and v_existing.description=btrim(p_description)
      and v_existing.category=p_category and v_existing.meeting=btrim(p_meeting) and v_existing.color=p_color then
      return orbit_private.club_summary(p_id);
    end if;
    raise exception 'Club request conflicts with an existing club' using errcode='22023';
  end if;
  if (select count(*) from public.orbit_clubs where created_by=v_uid and created_at>now()-interval '1 day')>=5 then
    raise exception 'Club creation limit reached; try again tomorrow' using errcode='P0004'; end if;
  insert into public.orbit_clubs(id,name,description,category,meeting,color,created_by)
    values(p_id,btrim(p_name),btrim(p_description),p_category,btrim(p_meeting),p_color,v_uid);
  insert into public.orbit_club_follows(club_id,profile_id) values(p_id,v_uid);
  return orbit_private.club_summary(p_id);
end; $$;

create function orbit_private.club_follow(p_club uuid,p_follow boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not exists(select 1 from public.orbit_profiles where id=v_uid) then
    raise exception 'Sign in to follow a club' using errcode='42501'; end if;
  if p_follow is null then raise exception 'Choose follow or unfollow' using errcode='22023'; end if;
  -- Serializes sends with unfollows so revoked chat access cannot race a send.
  perform 1 from public.orbit_clubs where id=p_club for update;
  if not found then raise exception 'Club not found' using errcode='P0002'; end if;
  if p_follow then
    insert into public.orbit_club_follows(club_id,profile_id) values(p_club,v_uid) on conflict do nothing;
  else delete from public.orbit_club_follows where club_id=p_club and profile_id=v_uid; end if;
  return orbit_private.club_summary(p_club);
end; $$;

create function orbit_private.club_messages(p_club uuid,p_before uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_time timestamptz; v_messages jsonb; v_more boolean;
begin
  if auth.uid() is null or not exists(select 1 from public.orbit_club_follows where club_id=p_club and profile_id=auth.uid()) then
    raise exception 'Follow this club to open its chat' using errcode='42501'; end if;
  if p_before is not null then
    select created_at into v_time from public.orbit_club_messages where id=p_before and club_id=p_club;
    if not found then raise exception 'Message not found' using errcode='P0002'; end if;
  end if;
  with candidates as (
    select m.* from public.orbit_club_messages m where m.club_id=p_club
      and (p_before is null or (m.created_at,m.id)<(v_time,p_before))
    order by m.created_at desc,m.id desc limit 51
  ), page as (select * from candidates order by created_at desc,id desc limit 50)
  select coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'createdAt',m.created_at,
    'author',jsonb_build_object('id',p.id,'name',p.name,'color',p.color)) order by m.created_at,m.id)
    from page m join public.orbit_profiles p on p.id=m.author_id),'[]'::jsonb),
    (select count(*)>50 from candidates) into v_messages,v_more;
  return jsonb_build_object('messages',v_messages,'hasMore',v_more);
end; $$;

create function orbit_private.club_send(p_club uuid,p_id uuid,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_existing public.orbit_club_messages;
begin
  if v_uid is null then raise exception 'Sign in to send a message' using errcode='42501'; end if;
  if p_id is null or p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'Messages must have between 1 and 2000 characters' using errcode='22023'; end if;
  perform 1 from public.orbit_clubs where id=p_club for update;
  if not found then raise exception 'Club not found' using errcode='P0002'; end if;
  if not exists(select 1 from public.orbit_club_follows where club_id=p_club and profile_id=v_uid) then
    raise exception 'Follow this club to send messages' using errcode='42501'; end if;
  select * into v_existing from public.orbit_club_messages where id=p_id;
  if found then
    if v_existing.author_id<>v_uid or v_existing.club_id<>p_club or v_existing.body<>btrim(p_body) then
      raise exception 'Message request conflicts with an existing message' using errcode='22023'; end if;
    return jsonb_build_object('sent',true);
  end if;
  if (select count(*) from public.orbit_club_messages where author_id=v_uid and club_id=p_club and created_at>clock_timestamp()-interval '1 minute')>=30 then
    raise exception 'Sending too quickly; wait a minute and try again' using errcode='P0001'; end if;
  insert into public.orbit_club_messages(id,club_id,author_id,body) values(p_id,p_club,v_uid,btrim(p_body));
  return jsonb_build_object('sent',true);
end; $$;

-- Elevated functions stay outside the exposed schema; public endpoints use caller privileges.
create function public.orbit_clubs_list(p_query text default '',p_category text default '',p_following boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$ select orbit_private.clubs_list(p_query,p_category,p_following); $$;
create function public.orbit_club_get(p_club uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select orbit_private.club_get(p_club); $$;
create function public.orbit_club_create(p_id uuid,p_name text,p_description text,p_category text,p_meeting text,p_color text)
returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.club_create(p_id,p_name,p_description,p_category,p_meeting,p_color); $$;
create function public.orbit_club_follow(p_club uuid,p_follow boolean) returns jsonb
language sql security invoker set search_path='' as $$ select orbit_private.club_follow(p_club,p_follow); $$;
create function public.orbit_club_messages(p_club uuid,p_before uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select orbit_private.club_messages(p_club,p_before); $$;
create function public.orbit_club_send(p_club uuid,p_id uuid,p_body text) returns jsonb
language sql security invoker set search_path='' as $$ select orbit_private.club_send(p_club,p_id,p_body); $$;

do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='orbit_private' and p.proname in ('clubs_list','club_get','club_create','club_follow','club_messages','club_send'))
       or (n.nspname='public' and p.proname in ('orbit_clubs_list','orbit_club_get','orbit_club_create','orbit_club_follow','orbit_club_messages','orbit_club_send'))
  loop
    execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
    execute format('grant execute on function %s to authenticated',fn.signature);
  end loop;
end; $$;
notify pgrst,'reload schema';
commit;
