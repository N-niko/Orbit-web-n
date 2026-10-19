-- Run after the migration in a disposable Supabase database or SQL editor.
-- Every fixture and mutation is rolled back. Any failed assertion raises an error.
begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001', 'orbit-test-a@example.invalid', '{"name":"Test Alice"}'),
  ('10000000-0000-4000-8000-000000000002', 'orbit-test-b@example.invalid', '{"name":"Test Bob"}');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('orbit.test.invite', (public.orbit_get_data()->'workspace'->>'inviteCode'), true);
select set_config('orbit.test.workspace', (public.orbit_get_data()->'workspace'->>'id'), true);
select set_config('orbit.test.post', (public.orbit_mutate('{"type":"create_post","body":"A private post","category":"general"}') -> 'posts' -> 0 ->> 'id'), true);
select set_config('orbit.test.task', (public.orbit_mutate('{"type":"create_task","title":"Kitchen","assignee":"10000000-0000-4000-8000-000000000001","dueDate":"2026-12-01","kind":"task"}') -> 'tasks' -> 0 ->> 'id'), true);
select set_config('orbit.test.expense', (public.orbit_mutate('{"type":"create_expense","title":"Groceries","amount":12.34,"paidBy":"10000000-0000-4000-8000-000000000001"}') -> 'expenses' -> 0 ->> 'id'), true);
select set_config('orbit.test.event', (public.orbit_mutate('{"type":"create_event","title":"Study group","description":"Bring notes","location":"Library","startsAt":"2026-12-01T18:00:00Z","category":"Academic","cover":"violet"}') -> 'events' -> 0 ->> 'id'), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);

do $$
declare v_data jsonb;
begin
  -- A different user's direct reads and normal RPC snapshots cannot see Alice's data.
  if exists(select 1 from public.orbit_posts) then raise exception 'RLS leaked another workspace post'; end if;
  if exists(select 1 from public.orbit_profiles where id = '10000000-0000-4000-8000-000000000001') then raise exception 'RLS leaked another profile'; end if;
  v_data := public.orbit_get_data();
  if jsonb_array_length(v_data->'posts') <> 0 then raise exception 'RPC leaked another workspace post'; end if;

  begin
    perform public.orbit_mutate(jsonb_build_object('type','toggle_like','id',current_setting('orbit.test.post')));
    raise exception 'Cross-workspace like succeeded';
  exception when no_data_found then null; end;
  begin
    perform public.orbit_mutate(jsonb_build_object('type','add_comment','id',current_setting('orbit.test.post'),'body','forged'));
    raise exception 'Cross-workspace comment succeeded';
  exception when no_data_found then null; end;
  begin
    perform public.orbit_mutate(jsonb_build_object('type','toggle_task','id',current_setting('orbit.test.task')));
    raise exception 'Cross-workspace task succeeded';
  exception when no_data_found then null; end;
  begin
    perform public.orbit_mutate(jsonb_build_object('type','toggle_rsvp','id',current_setting('orbit.test.event')));
    raise exception 'Cross-workspace RSVP succeeded';
  exception when no_data_found then null; end;
  begin
    perform public.orbit_mutate('{"type":"create_expense","title":"Forged payer","amount":10,"paidBy":"10000000-0000-4000-8000-000000000001"}');
    raise exception 'Nonmember expense payer accepted';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.orbit_posts(workspace_id,author_id,body,category) values (current_setting('orbit.test.workspace')::uuid,'10000000-0000-4000-8000-000000000001','forged','general');
    raise exception 'Direct write bypassed RPC validation';
  exception when insufficient_privilege then null; end;
  begin
    perform public._orbit_profile_json('10000000-0000-4000-8000-000000000001');
    raise exception 'Private helper exposed another profile';
  exception when insufficient_privilege then null; end;

  -- Joining is the explicit grant of access. Authors stay tied to authenticated IDs.
  v_data := public.orbit_mutate(jsonb_build_object('type','join_workspace','code',current_setting('orbit.test.invite')));
  if jsonb_array_length(v_data->'workspace'->'members') <> 2 or jsonb_array_length(v_data->'posts') <> 1 then raise exception 'Invite join failed'; end if;
  v_data := public.orbit_mutate(jsonb_build_object('type','add_comment','id',current_setting('orbit.test.post'),'body','Hello Alice'));
  if v_data->'posts'->0->'comments'->0->'author'->>'id' <> '10000000-0000-4000-8000-000000000002' then raise exception 'Comment identity forged'; end if;
  v_data := public.orbit_mutate('{"type":"update_profile","name":"Bob Updated","major":"Math","year":"Senior","bio":"Hello"}');
  if v_data->'posts'->0->'comments'->0->'author'->>'name' <> 'Bob Updated' then raise exception 'Profile changes were not hydrated'; end if;

  v_data := public.orbit_mutate(jsonb_build_object('type','toggle_like','id',current_setting('orbit.test.post')));
  if jsonb_array_length(v_data->'posts'->0->'likes') <> 1 then raise exception 'Like did not persist'; end if;
  v_data := public.orbit_mutate(jsonb_build_object('type','toggle_like','id',current_setting('orbit.test.post')));
  if jsonb_array_length(v_data->'posts'->0->'likes') <> 0 then raise exception 'Unlike did not persist'; end if;
  v_data := public.orbit_mutate(jsonb_build_object('type','toggle_rsvp','id',current_setting('orbit.test.event')));
  if jsonb_array_length(v_data->'events'->0->'attendees') <> 1 then raise exception 'RSVP did not persist'; end if;
  v_data := public.orbit_mutate(jsonb_build_object('type','toggle_rsvp','id',current_setting('orbit.test.event')));
  if jsonb_array_length(v_data->'events'->0->'attendees') <> 0 then raise exception 'RSVP cancellation did not persist'; end if;
  v_data := public.orbit_mutate(jsonb_build_object('type','toggle_task','id',current_setting('orbit.test.task')));
  if (v_data->'tasks'->0->>'completed')::boolean is not true then raise exception 'Shared task toggle failed'; end if;
  begin
    perform public.orbit_mutate(jsonb_build_object('type','delete_task','id',current_setting('orbit.test.task')));
    raise exception 'Noncreator deleted shared task';
  exception when insufficient_privilege then null; end;
  begin
    perform public.orbit_mutate(jsonb_build_object('type','delete_expense','id',current_setting('orbit.test.expense')));
    raise exception 'Noncreator deleted shared expense';
  exception when insufficient_privilege then null; end;

  v_data := public.orbit_mutate('{"type":"create_workspace","name":"A fresh orbit"}');
  if v_data->'workspace'->>'name' <> 'A fresh orbit' or jsonb_array_length(v_data->'posts') <> 0 then raise exception 'Create workspace did not switch context'; end if;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform public.orbit_get_data();
    raise exception 'Anonymous RPC access succeeded';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
rollback;
