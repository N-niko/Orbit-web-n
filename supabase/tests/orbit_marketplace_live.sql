-- Run against the hosted project in SQL Editor. All writes roll back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users where email_confirmed_at is not null and lower(split_part(email,'@',2))='caldwell.edu' limit 1),true);
set local role authenticated;
do $$ declare v jsonb; item uuid:='9f000000-0000-4000-8000-000000000001'; begin
 if not (public.orbit_market('{"type":"identity"}')->>'eligible')::boolean then raise exception 'Confirmed campus identity failed'; end if;
 v:=public.orbit_market(jsonb_build_object('type','publish','listing',jsonb_build_object('id',item,'kind','wanted','title','Rollback marketplace check','description','Temporary wanted request for permission checks; transaction will roll back.','category','Other','price',null,'condition',null,'pickup',null,'area','','availability',null,'textbook',jsonb_build_object('course','','isbn','','edition',''),'photoIds','[]'::jsonb,'status','active','rulesAccepted',true)));
 if v->'owner'->>'id'<>auth.uid()::text or (select count(*) from jsonb_object_keys(v->'owner'))<>3 then raise exception 'Owner or seller privacy failed'; end if;
 v:=public.orbit_market('{"type":"browse","kind":"wanted","section":"mine","q":"Rollback marketplace check","category":null,"min":null,"max":null,"condition":null,"pickup":null,"availability":null,"sort":"newest","offset":0}');
 if jsonb_array_length(v->'listings')<>1 then raise exception 'Published wanted request not searchable'; end if;
 perform public.orbit_market(jsonb_build_object('type','save','id',item,'saved',true));
 if not (public.orbit_market(jsonb_build_object('type','detail','id',item))->>'saved')::boolean then raise exception 'Save did not persist'; end if;
 perform public.orbit_market(jsonb_build_object('type','delete','id',item));
 if exists(select 1 from public.orbit_market_listings where id=item) then raise exception 'Deleted item still visible'; end if;
end; $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from auth.users where email_confirmed_at is null or lower(split_part(email,'@',2))<>'caldwell.edu' limit 1),true);
set local role authenticated;
do $$ begin
 if (public.orbit_market('{"type":"identity"}')->>'eligible')::boolean then raise exception 'Noncampus account was verified'; end if;
 begin perform public.orbit_market('{"type":"conversations","offset":0}'); raise exception 'Noncampus inquiry access accepted'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.orbit_market_listings) then raise exception 'Noncampus RLS access accepted'; end if;
end; $$;
reset role;
rollback;
select 'Marketplace live checks passed; all test writes rolled back' as result,(select count(*) from public.orbit_market_listings where id='9f000000-0000-4000-8000-000000000001') as retained_test_listings;
