-- Persist profile choices and enforce them in every profile projection.
begin;
alter table public.orbit_profiles add column visibility jsonb not null
  default '{"major":true,"year":true,"bio":true}'::jsonb
  check (jsonb_typeof(visibility) = 'object'
    and visibility ?& array['major','year','bio']
    and (visibility - array['major','year','bio']) = '{}'::jsonb
    and jsonb_typeof(visibility->'major') = 'boolean'
    and jsonb_typeof(visibility->'year') = 'boolean'
    and jsonb_typeof(visibility->'bio') = 'boolean');

-- RPC snapshots provide the owner's complete profile and filter visitors' fields.
-- Direct reads cannot bypass these choices, even inside a shared workspace.
revoke select on public.orbit_profiles from authenticated;
grant select (id, name, university, color, avatar_path) on public.orbit_profiles to authenticated;

create or replace function public._orbit_profile_json(p_profile uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'name', name, 'university', university,
    'major', case when id = auth.uid() or (visibility->>'major')::boolean then major else '' end,
    'year', case when id = auth.uid() or (visibility->>'year')::boolean then year else '' end,
    'bio', case when id = auth.uid() or (visibility->>'bio')::boolean then bio else '' end,
    'color', color,
    'graduationYear', case when id = auth.uid() or (visibility->>'year')::boolean then graduation_year end,
    'residency', residency, 'residenceHall', residence_hall, 'avatarPath', avatar_path,
    'onboardingCompletedAt', onboarding_completed_at)
    || case when id = auth.uid() then jsonb_build_object('visibility', visibility) else '{}'::jsonb end
  from public.orbit_profiles where id = p_profile;
$$;
-- Existing execution restrictions on the internal helper are preserved.

create or replace function orbit_private.set_profile_visibility(p_field text, p_visible boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to change visibility' using errcode = '42501'; end if;
  if p_field is null or p_field not in ('major','year','bio') or p_visible is null then
    raise exception 'Invalid visibility choice' using errcode = '22023';
  end if;
  update public.orbit_profiles set visibility = jsonb_set(visibility, array[p_field], to_jsonb(p_visible))
    where id = auth.uid();
  if not found then raise exception 'Profile not found' using errcode = 'P0002'; end if;
  return public.orbit_get_data();
end;
$$;
revoke all on function orbit_private.set_profile_visibility(text,boolean) from public, anon, authenticated;
grant execute on function orbit_private.set_profile_visibility(text,boolean) to authenticated;

create or replace function public.orbit_set_profile_visibility(p_field text, p_visible boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select orbit_private.set_profile_visibility(p_field, p_visible);
$$;
revoke all on function public.orbit_set_profile_visibility(text,boolean) from public, anon, authenticated;
grant execute on function public.orbit_set_profile_visibility(text,boolean) to authenticated;

create or replace function orbit_private.search_people(p_query text, p_limit integer default 24)
returns table(id uuid, name text, university text, major text, year text, "graduationYear" integer, color text)
language plpgsql stable security definer set search_path = '' as $$
declare v_query text; v_words text[];
begin
  if auth.uid() is null then
    raise exception 'Sign in to search for people' using errcode = '42501';
  end if;
  if p_query is null or char_length(btrim(p_query)) < 2 or char_length(btrim(p_query)) > 100 then
    raise exception 'Search must have between 2 and 100 characters' using errcode = '22023';
  end if;
  v_query := lower(regexp_replace(regexp_replace(normalize(btrim(p_query), NFKD), U&'[\0300-\036f]', '', 'g'), '[[:space:]]+', ' ', 'g'));
  v_words := string_to_array(v_query, ' ');
  if char_length(btrim(v_query)) < 2 then
    raise exception 'Enter at least 2 searchable characters' using errcode = '22023';
  end if;
  return query
    select p.id, p.name, p.university,
      case when (p.visibility->>'major')::boolean then p.major else '' end,
      case when (p.visibility->>'year')::boolean then p.year else '' end,
      case when (p.visibility->>'year')::boolean then p.graduation_year end, p.color
    from public.orbit_profiles p
    cross join lateral (
      select lower(regexp_replace(normalize(p.name || ' ' || case when (p.visibility->>'major')::boolean then p.major else '' end, NFKD), U&'[\0300-\036f]', '', 'g')) as searchable,
        lower(regexp_replace(normalize(p.name, NFKD), U&'[\0300-\036f]', '', 'g')) as search_name
    ) n
    where not exists (
      select 1 from unnest(v_words) as word
      where strpos(n.searchable, word) = 0
    )
    order by (strpos(n.search_name, v_query) = 1) desc, p.name, p.id
    limit greatest(1, least(coalesce(p_limit, 24), 24));
end;
$$;
revoke all on function orbit_private.search_people(text, integer) from public, anon, authenticated;
grant execute on function orbit_private.search_people(text, integer) to authenticated;


notify pgrst, 'reload schema';
commit;
