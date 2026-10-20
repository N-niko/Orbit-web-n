-- Apply AFTER 202610180001_orbit.sql. Existing accounts complete setup once.
-- Housing is self-reported profile data, never an authorization claim.
begin;

alter table public.orbit_profiles
  add column graduation_year integer check (graduation_year between 2000 and 2100),
  add column residency text check (residency in ('commuter', 'resident')),
  add column residence_hall text,
  add column avatar_path text,
  add column onboarding_completed_at timestamptz,
  add constraint orbit_valid_housing check (
    case when residency is null then residence_hall is null
      when residency = 'commuter' then residence_hall is null
      when residency = 'resident' then residence_hall is not null and residence_hall in
        ('Mother Joseph Residence Hall', 'Dominican Hall', 'Rosary Hall')
      else false end
  ),
  add constraint orbit_completed_profile check (onboarding_completed_at is null or
    (residency is not null and graduation_year is not null and char_length(btrim(major)) > 0));

create or replace function public._orbit_profile_json(p_profile uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'name', name, 'university', university, 'major', major,
    'year', year, 'bio', bio, 'color', color, 'graduationYear', graduation_year,
    'residency', residency, 'residenceHall', residence_hall, 'avatarPath', avatar_path,
    'onboardingCompletedAt', onboarding_completed_at)
  from public.orbit_profiles where id = p_profile;
$$;
-- CREATE OR REPLACE preserves this helper's existing restricted execution grants.

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('orbit-avatars', 'orbit-avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy orbit_avatar_insert on storage.objects for insert to authenticated
with check (bucket_id = 'orbit-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy orbit_avatar_read on storage.objects for select to authenticated
using (bucket_id = 'orbit-avatars' and exists (
  select 1 from public.orbit_profiles p where p.avatar_path = storage.objects.name
));
-- The profile SELECT policy already restricts this to the user's shared workspaces.
-- Owners can also read a just-uploaded photo before it is attached to their profile.
create policy orbit_avatar_owner_read on storage.objects for select to authenticated
using (bucket_id = 'orbit-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy orbit_avatar_delete on storage.objects for delete to authenticated
using (bucket_id = 'orbit-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create schema if not exists orbit_private;
revoke all on schema orbit_private from public, anon;
grant usage on schema orbit_private to authenticated;

-- Privileged implementation stays outside the exposed public API schema.
create function orbit_private.save_onboarding(p_major text, p_graduation_year integer,
  p_residency text, p_residence_hall text, p_avatar_path text, p_complete boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_profile public.orbit_profiles;
begin
  if v_uid is null or not exists(select 1 from auth.users where id = v_uid) then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform public.orbit_get_data();
  select * into v_profile from public.orbit_profiles where id = v_uid for update;
  -- Completion is durable and cannot be reset through the setup endpoint.
  if v_profile.onboarding_completed_at is not null then return public.orbit_get_data(); end if;
  if p_major is null or char_length(btrim(p_major)) not between 1 and 100 or
    p_graduation_year is null or p_graduation_year not between 2000 and 2100 or
    p_residency is null or p_residency not in ('commuter', 'resident') or p_complete is null then
    raise exception 'Check your profile details' using errcode = '22023';
  end if;
  if (p_residency = 'commuter' and p_residence_hall is not null) or
    (p_residency = 'resident' and (p_residence_hall is null or p_residence_hall not in
      ('Mother Joseph Residence Hall', 'Dominican Hall', 'Rosary Hall'))) then
    raise exception 'Choose a valid residence hall' using errcode = '22023';
  end if;
  if p_avatar_path is not null and (
    p_avatar_path !~ ('^' || v_uid::text || '/[a-f0-9-]+\.(jpg|png|webp)$') or
    not exists(select 1 from storage.objects where bucket_id = 'orbit-avatars' and name = p_avatar_path)
  ) then raise exception 'Choose your own uploaded photo' using errcode = '22023'; end if;
  update public.orbit_profiles set major = btrim(p_major), graduation_year = p_graduation_year,
    residency = p_residency, residence_hall = p_residence_hall,
    avatar_path = coalesce(p_avatar_path, avatar_path),
    onboarding_completed_at = case when p_complete then now() else null end
  where id = v_uid;
  return public.orbit_get_data();
end;
$$;
revoke all on function orbit_private.save_onboarding(text,integer,text,text,text,boolean) from public, anon;
grant execute on function orbit_private.save_onboarding(text,integer,text,text,text,boolean) to authenticated;

create function public.orbit_save_onboarding(p_major text, p_graduation_year integer,
  p_residency text, p_residence_hall text, p_avatar_path text, p_complete boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select orbit_private.save_onboarding(p_major,p_graduation_year,p_residency,p_residence_hall,p_avatar_path,p_complete);
$$;
revoke all on function public.orbit_save_onboarding(text,integer,text,text,text,boolean) from public, anon;
grant execute on function public.orbit_save_onboarding(text,integer,text,text,text,boolean) to authenticated;

commit;
