-- Isolated fixtures: settings persist, private fields stay private, writes target only the caller.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('40000000-0000-4000-8000-000000000001','visibility-a@example.invalid','{"name":"Privacy Alice"}'),
 ('40000000-0000-4000-8000-000000000002','visibility-b@example.invalid','{"name":"Privacy Bob"}');
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
select set_config('orbit.test.privacy_invite',public.orbit_get_data()->'workspace'->>'inviteCode',true);
update public.orbit_profiles set graduation_year=2030 where id='40000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.orbit_mutate('{"type":"update_profile","name":"Privacy Alice","major":"Secret Biology","year":"Junior","bio":"Private introduction"}');
select public.orbit_set_profile_visibility('major',false);
select public.orbit_set_profile_visibility('year',false);
select public.orbit_set_profile_visibility('bio',false);
do $$ declare v_profile jsonb; begin
  v_profile := public.orbit_get_data()->'profile';
  if v_profile->>'major' <> 'Secret Biology' or v_profile->>'bio' <> 'Private introduction'
     or v_profile->'visibility' <> '{"major":false,"year":false,"bio":false}'::jsonb then
    raise exception 'Visibility did not persist or erased owner data'; end if;
  begin perform public.orbit_set_profile_visibility('name',false);
    raise exception 'Invalid visibility field accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.orbit_set_profile_visibility('major',null);
    raise exception 'Null visibility accepted'; exception when invalid_parameter_value then null; end;
end; $$;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000002',true);
do $$ declare v_profile jsonb; v_data jsonb; begin
  select to_jsonb(p) into v_profile from public.orbit_search_people('privacy alice') p;
  if v_profile->>'major' <> '' or v_profile->>'year' <> '' or v_profile->>'graduationYear' is not null then
    raise exception 'Directory exposed hidden details'; end if;
  if exists(select 1 from public.orbit_search_people('Secret Biology')) then
    raise exception 'Search inferred a hidden major'; end if;
  v_data := public.orbit_mutate(jsonb_build_object('type','join_workspace','code',current_setting('orbit.test.privacy_invite')));
  select p into v_profile from jsonb_array_elements(v_data->'workspace'->'members') p
    where p->>'id'='40000000-0000-4000-8000-000000000001';
  if v_profile->>'major' <> '' or v_profile->>'year' <> '' or v_profile->>'bio' <> ''
    or v_profile->>'graduationYear' is not null or v_profile ? 'visibility' then
    raise exception 'Shared workspace bypassed profile choices'; end if;
  begin perform major from public.orbit_profiles;
    raise exception 'Direct column read bypassed privacy'; exception when insufficient_privilege then null; end;
  -- Bob's setting change cannot update Alice's settings.
  perform public.orbit_set_profile_visibility('major',true);
  if exists(select 1 from public.orbit_search_people('Secret Biology')) then
    raise exception 'Another account changed owner privacy'; end if;
end; $$;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
select public.orbit_set_profile_visibility('major',true);
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000002',true);
do $$ begin
  if not exists(select 1 from public.orbit_search_people('Secret Biology')) then
    raise exception 'Restoring visibility did not restore discovery'; end if;
end; $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin perform public.orbit_set_profile_visibility('major',false);
    raise exception 'Missing identity changed privacy'; exception when insufficient_privilege then null; end;
end; $$;
set local role anon;
do $$ begin
  begin perform public.orbit_set_profile_visibility('major',false);
    raise exception 'Anonymous privacy write allowed'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
