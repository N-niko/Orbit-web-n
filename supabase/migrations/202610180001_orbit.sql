-- Orbit: authenticated, workspace-scoped collaboration. No service-role key is used.
-- Apply once to a new Supabase project, using the SQL editor or `supabase db push`.

create table public.orbit_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  university text not null default 'Caldwell University' check (char_length(university) between 1 and 120),
  major text not null default '' check (char_length(major) <= 100),
  year text not null default '' check (char_length(year) <= 40),
  bio text not null default '' check (char_length(bio) <= 500),
  color text not null default '#e9e0f7',
  current_workspace_id uuid,
  created_at timestamptz not null default now()
);

create table public.orbit_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  owner_id uuid not null references public.orbit_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.orbit_profiles add constraint orbit_profiles_current_workspace_fkey
  foreign key (current_workspace_id) references public.orbit_workspaces(id) on delete set null;

create table public.orbit_memberships (
  workspace_id uuid not null references public.orbit_workspaces(id) on delete cascade,
  profile_id uuid not null references public.orbit_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, profile_id)
);
create index orbit_memberships_profile_idx on public.orbit_memberships(profile_id);

create table public.orbit_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.orbit_workspaces(id) on delete cascade,
  author_id uuid not null references public.orbit_profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  category text not null check (category in ('general', 'question', 'marketplace')),
  created_at timestamptz not null default now()
);
create index orbit_posts_workspace_idx on public.orbit_posts(workspace_id, created_at desc);

create table public.orbit_likes (
  post_id uuid not null references public.orbit_posts(id) on delete cascade,
  profile_id uuid not null references public.orbit_profiles(id) on delete cascade,
  primary key (post_id, profile_id)
);

create table public.orbit_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.orbit_posts(id) on delete cascade,
  author_id uuid not null references public.orbit_profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index orbit_comments_post_idx on public.orbit_comments(post_id, created_at);

create table public.orbit_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.orbit_workspaces(id) on delete cascade,
  creator_id uuid not null references public.orbit_profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  assignee_id uuid not null references public.orbit_profiles(id) on delete cascade,
  due_date date not null,
  completed boolean not null default false,
  kind text not null check (kind in ('task', 'grocery')),
  created_at timestamptz not null default now()
);
create index orbit_tasks_workspace_idx on public.orbit_tasks(workspace_id, created_at desc);

create table public.orbit_expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.orbit_workspaces(id) on delete cascade,
  creator_id uuid not null references public.orbit_profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  amount numeric(12,2) not null check (amount > 0 and amount <= 100000),
  paid_by_id uuid not null references public.orbit_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index orbit_expenses_workspace_idx on public.orbit_expenses(workspace_id, created_at desc);

create table public.orbit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.orbit_workspaces(id) on delete cascade,
  host_id uuid not null references public.orbit_profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 3000),
  location text not null check (char_length(btrim(location)) between 1 and 160),
  starts_at timestamptz not null,
  category text not null check (category in ('Social', 'Academic', 'Clubs', 'Wellness')),
  cover text not null check (cover in ('violet', 'peach', 'green', 'blue')),
  created_at timestamptz not null default now()
);
create index orbit_events_workspace_idx on public.orbit_events(workspace_id, starts_at);

create table public.orbit_rsvps (
  event_id uuid not null references public.orbit_events(id) on delete cascade,
  profile_id uuid not null references public.orbit_profiles(id) on delete cascade,
  primary key (event_id, profile_id)
);

-- Helpers are private to RPCs except the two narrowly scoped RLS predicates.
create function public._orbit_is_member(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.orbit_memberships where workspace_id = p_workspace and profile_id = auth.uid());
$$;

create function public._orbit_shares_workspace(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_profile = auth.uid() or exists (
    select 1 from public.orbit_memberships mine join public.orbit_memberships theirs using (workspace_id)
    where mine.profile_id = auth.uid() and theirs.profile_id = p_profile
  );
$$;

create function public._orbit_profile_json(p_profile uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'name', name, 'university', university, 'major', major, 'year', year, 'bio', bio, 'color', color)
  from public.orbit_profiles where id = p_profile;
$$;

create function public._orbit_initialize_user(p_uid uuid, p_name text, p_university text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_workspace uuid;
begin
  insert into public.orbit_profiles(id, name, university)
  values (p_uid, left(coalesce(nullif(btrim(p_name), ''), 'Orbit member'), 80), left(coalesce(nullif(btrim(p_university), ''), 'Caldwell University'), 120))
  on conflict (id) do nothing;
  -- Per-user row locking makes lazy initialization and simultaneous first requests safe.
  select current_workspace_id into v_workspace from public.orbit_profiles where id = p_uid for update;
  if v_workspace is null then
    insert into public.orbit_workspaces(name, owner_id) values ('My Orbit', p_uid) returning id into v_workspace;
    insert into public.orbit_memberships(workspace_id, profile_id) values (v_workspace, p_uid);
    update public.orbit_profiles set current_workspace_id = v_workspace where id = p_uid;
  end if;
  return v_workspace;
end;
$$;

create function public.orbit_handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._orbit_initialize_user(new.id, new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'university');
  return new;
end;
$$;
create trigger orbit_on_auth_user_created after insert on auth.users for each row execute function public.orbit_handle_new_user();

create function public.orbit_get_data() returns jsonb
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
    'posts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'author', public._orbit_profile_json(p.author_id), 'body', p.body, 'category', p.category, 'createdAt', p.created_at,
      'likes', coalesce((select jsonb_agg(l.profile_id order by l.profile_id) from public.orbit_likes l where l.post_id = p.id), '[]'::jsonb),
      'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'author', public._orbit_profile_json(c.author_id), 'body', c.body, 'createdAt', c.created_at) order by c.created_at, c.id) from public.orbit_comments c where c.post_id = p.id), '[]'::jsonb)
    ) order by p.created_at desc, p.id) from public.orbit_posts p where p.workspace_id = v_workspace), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'assignee', t.assignee_id, 'dueDate', t.due_date, 'completed', t.completed, 'kind', t.kind) order by t.created_at desc, t.id) from public.orbit_tasks t where t.workspace_id = v_workspace), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'amount', e.amount, 'paidBy', e.paid_by_id, 'createdAt', e.created_at) order by e.created_at desc, e.id) from public.orbit_expenses e where e.workspace_id = v_workspace), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'description', e.description, 'location', e.location, 'startsAt', e.starts_at, 'category', e.category, 'cover', e.cover, 'host', e.host_id,
      'attendees', coalesce((select jsonb_agg(r.profile_id order by r.profile_id) from public.orbit_rsvps r where r.event_id = e.id), '[]'::jsonb)
    ) order by e.starts_at, e.id) from public.orbit_events e where e.workspace_id = v_workspace), '[]'::jsonb)
  );
end;
$$;

create function public.orbit_mutate(p_action jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_workspace uuid; v_target uuid; v_member uuid;
  v_type text := p_action->>'type'; v_title text; v_body text; v_code text;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- Also initializes accounts created before this migration.
  perform public.orbit_get_data();
  select current_workspace_id into v_workspace from public.orbit_profiles where id = v_uid for update;
  if not public._orbit_is_member(v_workspace) then raise exception 'Workspace access denied' using errcode = '42501'; end if;
  -- Serialize workspace writes. Concurrent toggles and invitation joins cannot lose updates.
  perform 1 from public.orbit_workspaces where id = v_workspace for update;
  if jsonb_typeof(p_action) <> 'object' then raise exception 'Expected an action' using errcode = '22023'; end if;

  case v_type
    when 'create_post' then
      v_body := btrim(p_action->>'body');
      if v_body is null or char_length(v_body) not between 1 and 3000 or (p_action->>'category') is null then raise exception 'Invalid post' using errcode = '22023'; end if;
      insert into public.orbit_posts(workspace_id, author_id, body, category) values (v_workspace, v_uid, v_body, p_action->>'category');
    when 'toggle_like' then
      v_target := (p_action->>'id')::uuid;
      if not exists(select 1 from public.orbit_posts where id = v_target and workspace_id = v_workspace) then raise exception 'Post not found' using errcode = 'P0002'; end if;
      delete from public.orbit_likes where post_id = v_target and profile_id = v_uid;
      if not found then insert into public.orbit_likes(post_id, profile_id) values (v_target, v_uid); end if;
    when 'add_comment' then
      v_target := (p_action->>'id')::uuid; v_body := btrim(p_action->>'body');
      if not exists(select 1 from public.orbit_posts where id = v_target and workspace_id = v_workspace) then raise exception 'Post not found' using errcode = 'P0002'; end if;
      if v_body is null or char_length(v_body) not between 1 and 1000 then raise exception 'Invalid comment' using errcode = '22023'; end if;
      insert into public.orbit_comments(post_id, author_id, body) values (v_target, v_uid, v_body);
    when 'create_task' then
      v_member := (p_action->>'assignee')::uuid; v_title := btrim(p_action->>'title');
      if not exists(select 1 from public.orbit_memberships where workspace_id = v_workspace and profile_id = v_member) then raise exception 'Assignee is not a workspace member' using errcode = '22023'; end if;
      if v_title is null or char_length(v_title) not between 1 and 160 or p_action->>'dueDate' is null or p_action->>'kind' is null then raise exception 'Invalid task' using errcode = '22023'; end if;
      insert into public.orbit_tasks(workspace_id, creator_id, title, assignee_id, due_date, kind)
      values (v_workspace, v_uid, v_title, v_member, (p_action->>'dueDate')::date, p_action->>'kind');
    when 'toggle_task' then
      update public.orbit_tasks set completed = not completed where id = (p_action->>'id')::uuid and workspace_id = v_workspace;
      if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
    when 'delete_task' then
      if not exists(select 1 from public.orbit_tasks where id = (p_action->>'id')::uuid and workspace_id = v_workspace) then raise exception 'Task not found' using errcode = 'P0002'; end if;
      delete from public.orbit_tasks where id = (p_action->>'id')::uuid and workspace_id = v_workspace and creator_id = v_uid;
      if not found then raise exception 'Only the creator may delete this task' using errcode = '42501'; end if;
    when 'create_expense' then
      v_member := (p_action->>'paidBy')::uuid; v_title := btrim(p_action->>'title');
      if not exists(select 1 from public.orbit_memberships where workspace_id = v_workspace and profile_id = v_member) then raise exception 'Payer is not a workspace member' using errcode = '22023'; end if;
      if v_title is null or char_length(v_title) not between 1 and 160 or jsonb_typeof(p_action->'amount') is distinct from 'number' or (p_action->>'amount')::numeric <> round((p_action->>'amount')::numeric, 2) then raise exception 'Invalid expense' using errcode = '22023'; end if;
      insert into public.orbit_expenses(workspace_id, creator_id, title, amount, paid_by_id) values (v_workspace, v_uid, v_title, (p_action->>'amount')::numeric, v_member);
    when 'delete_expense' then
      if not exists(select 1 from public.orbit_expenses where id = (p_action->>'id')::uuid and workspace_id = v_workspace) then raise exception 'Expense not found' using errcode = 'P0002'; end if;
      delete from public.orbit_expenses where id = (p_action->>'id')::uuid and workspace_id = v_workspace and creator_id = v_uid;
      if not found then raise exception 'Only the creator may delete this expense' using errcode = '42501'; end if;
    when 'create_event' then
      v_title := btrim(p_action->>'title');
      if v_title is null or char_length(v_title) not between 1 and 160 or nullif(btrim(p_action->>'location'), '') is null or p_action->>'startsAt' is null or p_action->>'category' is null or p_action->>'cover' is null then raise exception 'Invalid event' using errcode = '22023'; end if;
      insert into public.orbit_events(workspace_id, host_id, title, description, location, starts_at, category, cover)
      values (v_workspace, v_uid, v_title, coalesce(btrim(p_action->>'description'), ''), btrim(p_action->>'location'), (p_action->>'startsAt')::timestamptz, p_action->>'category', p_action->>'cover');
    when 'toggle_rsvp' then
      v_target := (p_action->>'id')::uuid;
      if not exists(select 1 from public.orbit_events where id = v_target and workspace_id = v_workspace) then raise exception 'Event not found' using errcode = 'P0002'; end if;
      delete from public.orbit_rsvps where event_id = v_target and profile_id = v_uid;
      if not found then insert into public.orbit_rsvps(event_id, profile_id) values (v_target, v_uid); end if;
    when 'update_profile' then
      v_title := btrim(p_action->>'name');
      if v_title is null or char_length(v_title) not between 1 and 80 then raise exception 'Invalid profile name' using errcode = '22023'; end if;
      update public.orbit_profiles set name = v_title, major = coalesce(btrim(p_action->>'major'), ''), year = coalesce(btrim(p_action->>'year'), ''), bio = coalesce(btrim(p_action->>'bio'), '') where id = v_uid;
    when 'create_workspace' then
      v_title := btrim(p_action->>'name');
      if v_title is null or char_length(v_title) not between 1 and 80 then raise exception 'Invalid workspace name' using errcode = '22023'; end if;
      insert into public.orbit_workspaces(name, owner_id) values (v_title, v_uid) returning id into v_target;
      insert into public.orbit_memberships(workspace_id, profile_id) values (v_target, v_uid);
      update public.orbit_profiles set current_workspace_id = v_target where id = v_uid;
    when 'join_workspace' then
      v_code := upper(btrim(p_action->>'code'));
      if v_code is null or v_code !~ '^[A-Z0-9]{12}$' then raise exception 'Invalid invite code' using errcode = '22023'; end if;
      select id into v_target from public.orbit_workspaces where invite_code = v_code;
      if not found then raise exception 'Invite code not found' using errcode = 'P0002'; end if;
      insert into public.orbit_memberships(workspace_id, profile_id) values (v_target, v_uid) on conflict do nothing;
      update public.orbit_profiles set current_workspace_id = v_target where id = v_uid;
    else raise exception 'Unknown action' using errcode = '22023';
  end case;
  return public.orbit_get_data();
end;
$$;

-- Explicit privileges prevent clients from bypassing RPC validation or membership rules.
revoke all on public.orbit_profiles, public.orbit_workspaces, public.orbit_memberships, public.orbit_posts,
  public.orbit_likes, public.orbit_comments, public.orbit_tasks, public.orbit_expenses, public.orbit_events, public.orbit_rsvps from anon, authenticated;
grant select on public.orbit_profiles, public.orbit_workspaces, public.orbit_memberships, public.orbit_posts,
  public.orbit_likes, public.orbit_comments, public.orbit_tasks, public.orbit_expenses, public.orbit_events, public.orbit_rsvps to authenticated;

revoke all on function public._orbit_is_member(uuid), public._orbit_shares_workspace(uuid), public._orbit_profile_json(uuid),
  public._orbit_initialize_user(uuid,text,text), public.orbit_handle_new_user(), public.orbit_get_data(), public.orbit_mutate(jsonb) from public, anon, authenticated;
grant execute on function public._orbit_is_member(uuid), public._orbit_shares_workspace(uuid), public.orbit_get_data(), public.orbit_mutate(jsonb) to authenticated;

alter table public.orbit_profiles enable row level security;
alter table public.orbit_workspaces enable row level security;
alter table public.orbit_memberships enable row level security;
alter table public.orbit_posts enable row level security;
alter table public.orbit_likes enable row level security;
alter table public.orbit_comments enable row level security;
alter table public.orbit_tasks enable row level security;
alter table public.orbit_expenses enable row level security;
alter table public.orbit_events enable row level security;
alter table public.orbit_rsvps enable row level security;

create policy orbit_profiles_read on public.orbit_profiles for select to authenticated using (public._orbit_shares_workspace(id));
create policy orbit_workspaces_read on public.orbit_workspaces for select to authenticated using (public._orbit_is_member(id));
create policy orbit_memberships_read on public.orbit_memberships for select to authenticated using (public._orbit_is_member(workspace_id));
create policy orbit_posts_read on public.orbit_posts for select to authenticated using (public._orbit_is_member(workspace_id));
create policy orbit_likes_read on public.orbit_likes for select to authenticated using (exists(select 1 from public.orbit_posts p where p.id = post_id and public._orbit_is_member(p.workspace_id)));
create policy orbit_comments_read on public.orbit_comments for select to authenticated using (exists(select 1 from public.orbit_posts p where p.id = post_id and public._orbit_is_member(p.workspace_id)));
create policy orbit_tasks_read on public.orbit_tasks for select to authenticated using (public._orbit_is_member(workspace_id));
create policy orbit_expenses_read on public.orbit_expenses for select to authenticated using (public._orbit_is_member(workspace_id));
create policy orbit_events_read on public.orbit_events for select to authenticated using (public._orbit_is_member(workspace_id));
create policy orbit_rsvps_read on public.orbit_rsvps for select to authenticated using (exists(select 1 from public.orbit_events e where e.id = event_id and public._orbit_is_member(e.workspace_id)));
