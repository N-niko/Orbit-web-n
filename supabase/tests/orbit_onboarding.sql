begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('20000000-0000-4000-8000-000000000001','onboarding-a@example.invalid','{"name":"Setup Alice"}'),
 ('20000000-0000-4000-8000-000000000002','onboarding-b@example.invalid','{"name":"Setup Bob"}');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('orbit.test.onboarding_invite',public.orbit_get_data()->'workspace'->>'inviteCode',true);
set local role authenticated;

do $$
declare v_data jsonb; v_completed text;
begin
  v_data := public.orbit_get_data();
  if v_data->'profile'->>'onboardingCompletedAt' is not null then raise exception 'New user already completed setup'; end if;
  begin
    perform public.orbit_save_onboarding('Biology',2030,'resident',null,null,false);
    raise exception 'Resident without hall accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.orbit_save_onboarding('Biology',2030,'resident','Invented Hall',null,false);
    raise exception 'Invalid hall accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.orbit_save_onboarding('Biology',2030,'commuter','Rosary Hall',null,false);
    raise exception 'Commuter hall accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.orbit_save_onboarding('',2030,'commuter',null,null,false);
    raise exception 'Missing major accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.orbit_save_onboarding('Biology',1800,'commuter',null,null,false);
    raise exception 'Invalid graduation year accepted';
  exception when invalid_parameter_value then null; end;
  v_data := public.orbit_save_onboarding('Biology',2030,'resident','Rosary Hall',null,false);
  if v_data->'profile'->>'residenceHall' <> 'Rosary Hall' or v_data->'profile'->>'onboardingCompletedAt' is not null then
    raise exception 'Step 2 did not save independently'; end if;
  -- A fresh read must preserve progress after a refresh or later login.
  if public.orbit_get_data()->'profile'->>'graduationYear' <> '2030' then raise exception 'Progress lost'; end if;
  v_data := public.orbit_save_onboarding('Biology',2030,'commuter',null,null,false);
  if v_data->'profile'->>'residenceHall' is not null then raise exception 'Commuter retained hall'; end if;
  begin
    insert into storage.objects(bucket_id,name) values('orbit-avatars','20000000-0000-4000-8000-000000000002/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png');
    raise exception 'Upload into another user folder succeeded';
  exception when insufficient_privilege then null; end;
  insert into storage.objects(bucket_id,name) values('orbit-avatars','20000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png');
  begin
    perform public.orbit_save_onboarding('Biology',2030,'commuter',null,'20000000-0000-4000-8000-000000000001/missing.png',true);
    raise exception 'Nonexistent avatar accepted';
  exception when invalid_parameter_value then null; end;
  v_data := public.orbit_save_onboarding('Biology',2030,'commuter',null,'20000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',true);
  v_completed := v_data->'profile'->>'onboardingCompletedAt';
  if v_completed is null then raise exception 'Completion not persisted'; end if;
  v_data := public.orbit_save_onboarding('Forged',2040,'resident','Rosary Hall',null,false);
  if v_data->'profile'->>'onboardingCompletedAt' <> v_completed or v_data->'profile'->>'residency' <> 'commuter' then
    raise exception 'Completed setup was reset or changed'; end if;
end;
$$;

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
do $$
begin
  if exists(select 1 from storage.objects where bucket_id = 'orbit-avatars') then raise exception 'Unrelated user read private photo'; end if;
  begin
    perform public.orbit_save_onboarding('History',2031,'commuter',null,'20000000-0000-4000-8000-000000000001/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',true);
    raise exception 'Another user photo attached';
  exception when invalid_parameter_value then null; end;
  perform public.orbit_mutate(jsonb_build_object('type','join_workspace','code',current_setting('orbit.test.onboarding_invite')));
  if not exists(select 1 from storage.objects where bucket_id = 'orbit-avatars') then raise exception 'Workspace member cannot see profile photo'; end if;
  -- No photo is required to finish setup.
  perform public.orbit_save_onboarding('History',2031,'resident','Dominican Hall',null,true);
end;
$$;
reset role;
update auth.users set raw_user_meta_data = '{"residency":"resident","onboarding_completed_at":"forged"}' where id = '20000000-0000-4000-8000-000000000001';
do $$ begin
  if (select residency from public.orbit_profiles where id = '20000000-0000-4000-8000-000000000001') <> 'commuter' then
    raise exception 'Editable auth metadata changed residency'; end if;
end; $$;
set local role anon;
do $$ begin
  begin
    perform public.orbit_save_onboarding('History',2031,'commuter',null,null,true);
    raise exception 'Anonymous setup allowed';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
