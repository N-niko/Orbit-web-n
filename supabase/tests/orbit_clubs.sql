-- Every test record is rolled back; no production messages are sent.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('50000000-0000-4000-8000-000000000001','club-a@example.invalid','{"name":"Club Alice"}'),
 ('50000000-0000-4000-8000-000000000002','club-b@example.invalid','{"name":"Club Bob"}'),
 ('50000000-0000-4000-8000-000000000003','club-c@example.invalid','{"name":"Club Carol"}');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.orbit_club_create('50000000-0000-4000-8000-000000000010','Test Code Club','Build things together','Technology & learning','Tuesdays','violet');
select public.orbit_club_send('50000000-0000-4000-8000-000000000010','50000000-0000-4000-8000-000000000020','Hello from Alice');
select public.orbit_club_send('50000000-0000-4000-8000-000000000010','50000000-0000-4000-8000-000000000020','Hello from Alice');
do $$ declare v jsonb; begin
  v:=public.orbit_club_create('50000000-0000-4000-8000-000000000010','Test Code Club','Build things together','Technology & learning','Tuesdays','violet');
  if not (v->>'following')::boolean or (v->>'followerCount')::integer<>1 then raise exception 'Creator follow or idempotent create failed'; end if;
  if (select count(*) from public.orbit_club_messages)<>1 then raise exception 'Retried send duplicated message'; end if;
  begin perform public.orbit_club_create(gen_random_uuid(),'test code club','Duplicate','Other','','green');
    raise exception 'Duplicate club name allowed'; exception when unique_violation then null; end;
  begin perform public.orbit_club_create(gen_random_uuid(),'Bad club','Description','forged','','green');
    raise exception 'Invalid category accepted'; exception when invalid_parameter_value then null; end;
end; $$;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
do $$ declare v jsonb; begin
  v:=public.orbit_clubs_list('code','Technology & learning',false);
  if jsonb_array_length(v->'clubs')<>1 or (v->'clubs'->0->>'following')::boolean then raise exception 'Discovery across workspaces failed'; end if;
  if jsonb_array_length(public.orbit_clubs_list('','',true)->'clubs')<>0 then raise exception 'My clubs includes another user'; end if;
  if exists(select 1 from public.orbit_club_messages) then raise exception 'Nonfollower read messages directly'; end if;
  begin perform public.orbit_club_messages('50000000-0000-4000-8000-000000000010');
    raise exception 'Nonfollower read chat RPC'; exception when insufficient_privilege then null; end;
  begin perform public.orbit_club_send('50000000-0000-4000-8000-000000000010',gen_random_uuid(),'Not followed');
    raise exception 'Nonfollower sent message'; exception when insufficient_privilege then null; end;
  begin insert into public.orbit_club_follows(club_id,profile_id) values('50000000-0000-4000-8000-000000000010','50000000-0000-4000-8000-000000000003');
    raise exception 'Direct follow forged another identity'; exception when insufficient_privilege then null; end;
  v:=public.orbit_club_follow('50000000-0000-4000-8000-000000000010',true);
  v:=public.orbit_club_follow('50000000-0000-4000-8000-000000000010',true);
  if (v->>'followerCount')::integer<>2 then raise exception 'Follow was not idempotent'; end if;
  if (select count(*) from public.orbit_club_follows)<>1 then raise exception 'Private follow list leaked'; end if;
  v:=public.orbit_club_messages('50000000-0000-4000-8000-000000000010');
  if v->'messages'->0->>'body'<>'Hello from Alice' or (select count(*) from jsonb_object_keys(v->'messages'->0->'author'))<>3 then
    raise exception 'Group chat failed or exposed private profile fields'; end if;
  begin perform public.orbit_club_send('50000000-0000-4000-8000-000000000010','50000000-0000-4000-8000-000000000020','Hello from Alice');
    raise exception 'Message ID claimed by another account'; exception when invalid_parameter_value then null; end;
  begin perform public.orbit_club_send('50000000-0000-4000-8000-000000000010',gen_random_uuid(),'  ');
    raise exception 'Blank message accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.orbit_club_send('50000000-0000-4000-8000-000000000010',gen_random_uuid(),repeat('x',2001));
    raise exception 'Oversized message accepted'; exception when invalid_parameter_value then null; end;
end; $$;
select public.orbit_club_send('50000000-0000-4000-8000-000000000010','50000000-0000-4000-8000-000000000021','Hello from Bob');
do $$ begin
  if not exists(select 1 from public.orbit_club_messages where id='50000000-0000-4000-8000-000000000021' and author_id=auth.uid()) then
    raise exception 'Server did not derive message author'; end if;
  begin insert into public.orbit_club_messages(id,club_id,author_id,body) values(gen_random_uuid(),'50000000-0000-4000-8000-000000000010','50000000-0000-4000-8000-000000000001','forged');
    raise exception 'Direct message write bypassed checks'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
-- A history with identical timestamps exercises the ID tie breaker.
insert into public.orbit_club_messages(id,club_id,author_id,body,created_at)
select gen_random_uuid(),'50000000-0000-4000-8000-000000000010','50000000-0000-4000-8000-000000000001','History '||n,now()-interval '2 hours'
from generate_series(1,55) n;
set local role authenticated;
do $$ declare first_page jsonb; second_page jsonb; cursor_id uuid; begin
  first_page:=public.orbit_club_messages('50000000-0000-4000-8000-000000000010');
  if jsonb_array_length(first_page->'messages')<>50 or not (first_page->>'hasMore')::boolean then raise exception 'History page not bounded'; end if;
  cursor_id:=(first_page->'messages'->0->>'id')::uuid;
  second_page:=public.orbit_club_messages('50000000-0000-4000-8000-000000000010',cursor_id);
  if jsonb_array_length(second_page->'messages')<>7 or (second_page->>'hasMore')::boolean then raise exception 'Older history incomplete'; end if;
  if exists(select 1 from jsonb_array_elements(first_page->'messages') a join jsonb_array_elements(second_page->'messages') b on a->>'id'=b->>'id') then raise exception 'Paging duplicated messages'; end if;
end; $$;
select public.orbit_club_follow('50000000-0000-4000-8000-000000000010',false);
do $$ begin
  if exists(select 1 from public.orbit_club_messages) then raise exception 'Unfollow retained direct chat access'; end if;
  begin perform public.orbit_club_messages('50000000-0000-4000-8000-000000000010');
    raise exception 'Unfollow retained chat RPC access'; exception when insufficient_privilege then null; end;
  begin perform public.orbit_club_send('50000000-0000-4000-8000-000000000010',gen_random_uuid(),'After leaving');
    raise exception 'Unfollow retained send access'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
insert into public.orbit_club_messages(id,club_id,author_id,body)
select gen_random_uuid(),'50000000-0000-4000-8000-000000000010','50000000-0000-4000-8000-000000000001','Rate fixture '||n
from generate_series(1,30) n;
insert into public.orbit_clubs(id,name,description,category,created_by)
select gen_random_uuid(),'Creation limit fixture '||n,'Rate fixture','Other','50000000-0000-4000-8000-000000000001'
from generate_series(1,4) n;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
  begin perform public.orbit_club_send('50000000-0000-4000-8000-000000000010',gen_random_uuid(),'Over the send limit');
    raise exception 'Send limit was not enforced'; exception when sqlstate 'P0001' then
      if sqlerrm='Send limit was not enforced' then raise; end if; end;
  perform public.orbit_club_send('50000000-0000-4000-8000-000000000010','50000000-0000-4000-8000-000000000020','Hello from Alice');
  begin perform public.orbit_club_create(gen_random_uuid(),'Over the club limit','Rate fixture','Other','','green');
    raise exception 'Creation limit was not enforced'; exception when sqlstate 'P0004' then null; end;
end; $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin perform public.orbit_clubs_list(); raise exception 'Missing identity read clubs'; exception when insufficient_privilege then null; end;
  begin perform public.orbit_club_follow('50000000-0000-4000-8000-000000000010',true); raise exception 'Missing identity followed'; exception when insufficient_privilege then null; end;
end; $$;
set local role anon;
do $$ begin
  begin perform public.orbit_clubs_list(); raise exception 'Anonymous clubs access'; exception when insufficient_privilege then null; end;
  begin perform orbit_private.club_messages('50000000-0000-4000-8000-000000000010'); raise exception 'Anonymous private helper access'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
