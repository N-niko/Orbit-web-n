-- Verify that people can find one another without joining each other's workspace.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
  ('30000000-0000-4000-8000-000000000001', 'search-alice@example.invalid', '{"name":"Directory Alice"}'),
  ('30000000-0000-4000-8000-000000000002', 'search-bob@example.invalid', '{"name":"Dírèctory Bob"}');
insert into auth.users(id, email, raw_user_meta_data)
select gen_random_uuid(), 'search-bound-' || number || '@example.invalid', jsonb_build_object('name', 'Search Bound Fixture ' || number)
from generate_series(1, 30) number;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select public.orbit_get_data();
select public.orbit_mutate('{"type":"create_post","body":"Private search fixture","category":"general"}');
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select public.orbit_get_data();
set local role authenticated;

do $$
declare v_person jsonb; v_count integer;
begin
  select to_jsonb(person) into v_person from public.orbit_search_people('  directory   ALICE  ') person;
  if v_person->>'id' <> '30000000-0000-4000-8000-000000000001' or v_person is null then
    raise exception 'People search could not find an account in a separate workspace';
  end if;
  if (select count(*) from jsonb_object_keys(v_person)) <> 7
     or v_person ?| array['email', 'residency', 'residenceHall', 'avatarPath', 'current_workspace_id', 'bio'] then
    raise exception 'Directory exposed private fields';
  end if;
  if exists(select 1 from public.orbit_profiles where id = '30000000-0000-4000-8000-000000000001') then
    raise exception 'People search broadened profile RLS';
  end if;
  if exists(select 1 from public.orbit_posts) or jsonb_array_length(public.orbit_get_data()->'posts') <> 0 then
    raise exception 'People search exposed another workspace';
  end if;
  select count(*) into v_count from public.orbit_search_people('directory bob');
  if v_count <> 1 then raise exception 'Accent-insensitive name search failed'; end if;
  select count(*) into v_count from public.orbit_search_people('directory', 1);
  if v_count <> 1 then raise exception 'Requested result bound failed'; end if;
  select count(*) into v_count from public.orbit_search_people('bound fixture', 1000);
  if v_count <> 24 then raise exception 'Maximum result bound failed'; end if;
  if exists(select 1 from public.orbit_search_people('%%')) then raise exception 'Search treated percent signs as wildcards'; end if;
  begin
    perform public.orbit_search_people('');
    raise exception 'Empty directory queries allowed';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.orbit_search_people(E'\t\n');
    raise exception 'Whitespace-only directory query allowed';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.orbit_search_people(repeat('a', 101));
    raise exception 'Unbounded search input allowed';
  exception when invalid_parameter_value then null; end;
end;
$$;

-- Even an authenticated role with no user identity cannot call the helper.
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform public.orbit_search_people('directory');
    raise exception 'Missing identity allowed directory access';
  exception when insufficient_privilege then null; end;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform public.orbit_search_people('directory');
    raise exception 'Anonymous directory access succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform orbit_private.search_people('directory');
    raise exception 'Anonymous helper access succeeded';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
rollback;
