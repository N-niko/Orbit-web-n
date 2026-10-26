begin;
-- Operational retry records contain only exclusive file paths, never deleted post content.
create table orbit_private.post_file_cleanup (
 id uuid primary key,owner_id uuid not null references public.orbit_profiles(id) on delete cascade,
 path text not null unique,created_at timestamptz not null default clock_timestamp(),
 check(path=owner_id::text||'/'||id::text));
create index post_file_cleanup_owner_idx on orbit_private.post_file_cleanup(owner_id,created_at,id);
alter table orbit_private.post_file_cleanup enable row level security;
revoke all on orbit_private.post_file_cleanup from public,anon,authenticated;
create policy cleanup_owner_read on orbit_private.post_file_cleanup for select to authenticated using(owner_id=(select auth.uid()));

create function orbit_private.can_cleanup_post_file(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from orbit_private.post_file_cleanup where path=p_path and owner_id=auth.uid()); $$;
-- Storage's API performs the binary deletion. SQL never deletes storage.objects.
create policy orbit_files_cleanup_read on storage.objects for select to authenticated using(bucket_id='orbit-post-files' and orbit_private.can_cleanup_post_file(name));
create policy orbit_files_cleanup_delete on storage.objects for delete to authenticated using(bucket_id='orbit-post-files' and orbit_private.can_cleanup_post_file(name));
create function orbit_private.guard_cleanup_file() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from orbit_private.post_file_cleanup where id=new.id or path=new.path) then raise exception 'File cleanup is pending; use a new upload ID' using errcode='22023';end if;
 return new;
end; $$;
create trigger orbit_post_file_cleanup_guard before insert or update of id,path on public.orbit_post_files for each row execute function orbit_private.guard_cleanup_file();

create function orbit_private.can_delete_event(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.orbit_events e where e.id=p_id and e.host_id=auth.uid() and (e.club_id is null or exists(
 select 1 from public.orbit_clubs c join public.orbit_club_follows f on f.club_id=c.id and f.profile_id=auth.uid() where c.id=e.club_id and c.created_by=auth.uid()))); $$;
create function orbit_private.delete_content(p_kind text,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); owner uuid; club uuid; entry_kind text; begin
 if u is null then raise exception 'Sign in' using errcode='42501';end if;
 if p_id is null or p_kind is null or p_kind not in ('post','club_post','event') then raise exception 'Invalid deletion' using errcode='22023';end if;
 if p_kind='event' then
  select club_id into club from public.orbit_events where id=p_id;
  if club is not null then perform 1 from public.orbit_clubs where id=club for update;end if;
  select host_id into owner from public.orbit_events where id=p_id for update;
  if not found then return;end if;
  if not orbit_private.can_delete_event(p_id) then raise exception 'Only the event owner can delete it' using errcode='42501';end if;
  delete from public.orbit_events where id=p_id; -- RSVPs and personal choices cascade.
  return;
 elsif p_kind='club_post' then
  select club_id into club from public.orbit_club_messages where id=p_id;
  if club is not null then perform 1 from public.orbit_clubs where id=club for update;end if;
  select author_id,kind into owner,entry_kind from public.orbit_club_messages where id=p_id for update;
  if not found then return;end if;
  if owner<>u or entry_kind<>'post' then raise exception 'Only the post author can delete it' using errcode='42501';end if;
 else
  select author_id into owner from public.orbit_posts where id=p_id for update;
  if not found then return;end if;
  if owner<>u then raise exception 'Only the post author can delete it' using errcode='42501';end if;
 end if;
 insert into orbit_private.post_file_cleanup(id,owner_id,path)
 select id,owner_id,path from public.orbit_post_files where (p_kind='post' and post_id=p_id) or (p_kind='club_post' and club_post_id=p_id)
 on conflict(id) do nothing;
 if p_kind='post' then delete from public.orbit_posts where id=p_id;
 else delete from public.orbit_club_messages where id=p_id;end if;
 -- Likes, comments, nested replies, comment likes and attachment metadata cascade.
end; $$;

create function orbit_private.post_cleanup_files() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501';end if;
 return jsonb_build_object('files',coalesce((select jsonb_agg(jsonb_build_object('id',id,'path',path) order by created_at,id)
 from (select * from orbit_private.post_file_cleanup where owner_id=auth.uid() order by created_at,id limit 16) f),'[]'::jsonb));
end; $$;
create function orbit_private.post_cleanup_done(p_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501';end if;
 if p_ids is null or cardinality(p_ids)>16 then raise exception 'Invalid cleanup batch' using errcode='22023';end if;
 delete from orbit_private.post_file_cleanup f where f.owner_id=auth.uid() and f.id=any(p_ids)
 and not exists(select 1 from storage.objects o where o.bucket_id='orbit-post-files' and o.name=f.path);
 return jsonb_build_object('pending',exists(select 1 from orbit_private.post_file_cleanup where owner_id=auth.uid()));
end; $$;
create function public.orbit_post_cleanup_files() returns jsonb language sql stable security invoker set search_path='' as $$ select orbit_private.post_cleanup_files(); $$;
create function public.orbit_post_cleanup_done(p_ids uuid[]) returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.post_cleanup_done(p_ids); $$;

alter function orbit_private.get_data() rename to deletion_base_data;
create function orbit_private.get_data() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501';end if;
 return orbit_private.deletion_base_data()||jsonb_build_object('postFileCleanupPending',exists(select 1 from orbit_private.post_file_cleanup where owner_id=auth.uid()));
end; $$;
create or replace function public.orbit_get_data() returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.get_data(); $$;
create or replace function orbit_private.event_json(p_event uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('canDelete',orbit_private.can_delete_event(e.id),'id',e.id,'title',e.title,'description',e.description,'location',e.location,'createdAt',e.created_at,
 'startsAt',e.starts_at,'endsAt',e.ends_at,'audience',e.audience,'category',e.category,'cover',e.cover,'host',e.host_id,'hostName',p.name,
 'clubId',e.club_id,'clubName',c.name,'clubColor',c.color,
 'followingHost',exists(select 1 from public.orbit_user_follows f where f.follower_id=auth.uid() and f.followed_id=e.host_id),
 'attendeeCount',(select count(*) from public.orbit_rsvps r where r.event_id=e.id),
 'attendees',coalesce((select jsonb_agg(r.profile_id) from public.orbit_rsvps r where r.event_id=e.id and r.profile_id=auth.uid()),'[]'::jsonb),
 'response',case when exists(select 1 from public.orbit_rsvps r where r.event_id=e.id and r.profile_id=auth.uid()) then 'going' when choice.response='not_going' then 'not_going' end,
 'removed',coalesce(choice.removed,false))
 from public.orbit_events e join public.orbit_profiles p on p.id=e.host_id left join public.orbit_clubs c on c.id=e.club_id
 left join public.orbit_event_choices choice on choice.event_id=e.id and choice.profile_id=auth.uid() where e.id=p_event; $$;

alter function orbit_private.mutate(jsonb) rename to deletion_base_mutate;
create function orbit_private.mutate(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501';end if;
 if p_action->>'type'='delete_post' then
  if p_action ? 'club' and jsonb_typeof(p_action->'club')<>'boolean' then raise exception 'Invalid post scope' using errcode='22023';end if;
  perform orbit_private.delete_content(case when coalesce((p_action->>'club')::boolean,false) then 'club_post' else 'post' end,(p_action->>'id')::uuid);
 elsif p_action->>'type'='delete_event' then perform orbit_private.delete_content('event',(p_action->>'id')::uuid);
 else return orbit_private.deletion_base_mutate(p_action);end if;
 return public.orbit_get_data();
end; $$;
create or replace function public.orbit_mutate(p_action jsonb) returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.mutate(p_action); $$;

revoke all on function orbit_private.delete_content(text,uuid),orbit_private.can_delete_event(uuid),orbit_private.guard_cleanup_file(),orbit_private.deletion_base_data(),orbit_private.deletion_base_mutate(jsonb),orbit_private.event_json(uuid) from public,anon,authenticated;
revoke all on function orbit_private.can_cleanup_post_file(text),orbit_private.post_cleanup_files(),orbit_private.post_cleanup_done(uuid[]),orbit_private.get_data(),orbit_private.mutate(jsonb),public.orbit_post_cleanup_files(),public.orbit_post_cleanup_done(uuid[]) from public,anon,authenticated;
grant execute on function orbit_private.can_cleanup_post_file(text),orbit_private.post_cleanup_files(),orbit_private.post_cleanup_done(uuid[]),orbit_private.get_data(),orbit_private.mutate(jsonb),public.orbit_post_cleanup_files(),public.orbit_post_cleanup_done(uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
