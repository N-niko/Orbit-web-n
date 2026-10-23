-- A bounded directory of basic profiles for signed-in users.
-- Existing profile RLS, private avatars, and workspace RPCs remain unchanged.
begin;

create schema if not exists orbit_private;
revoke all on schema orbit_private from public, anon;
grant usage on schema orbit_private to authenticated;

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
    select p.id, p.name, p.university, p.major, p.year, p.graduation_year, p.color
    from public.orbit_profiles p
    cross join lateral (
      select lower(regexp_replace(normalize(p.name || ' ' || p.major, NFKD), U&'[\0300-\036f]', '', 'g')) as searchable,
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

-- The exposed RPC has caller privileges; the narrowly scoped elevated helper is
-- kept outside the exposed public schema and performs its own identity check.
create or replace function public.orbit_search_people(p_query text, p_limit integer default 24)
returns table(id uuid, name text, university text, major text, year text, "graduationYear" integer, color text)
language sql stable security invoker set search_path = '' as $$
  select * from orbit_private.search_people(p_query, p_limit);
$$;
revoke all on function public.orbit_search_people(text, integer) from public, anon, authenticated;
grant execute on function public.orbit_search_people(text, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
