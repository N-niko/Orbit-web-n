-- Fictional users and objects only; no permanent seed data.
begin;
insert into orbit_private.market_campuses values('test-campus','Test University','campus.example');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('90000000-0000-4000-8000-000000000001','seller@caldwell.edu',now(),'{"name":"Market Seller"}'),
 ('90000000-0000-4000-8000-000000000002','buyer@caldwell.edu',now(),'{"name":"Market Buyer"}'),
 ('90000000-0000-4000-8000-000000000003','outsider@campus.example',now(),'{"name":"Other Campus","university":"Caldwell University"}'),
 ('90000000-0000-4000-8000-000000000004','unconfirmed@caldwell.edu',null,'{"name":"Not Confirmed","email_confirmed_at":"2026-01-01"}'),
 ('90000000-0000-4000-8000-000000000005','personal@example.com',now(),'{"name":"Personal Account","university":"Caldwell University","email":"fake@caldwell.edu"}'),
 ('90000000-0000-4000-8000-000000000006','third@caldwell.edu',now(),'{"name":"Other Student"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000004',true);
do $$ begin
 if (public.orbit_market('{"type":"identity"}')->>'eligible')::boolean then raise exception 'Unconfirmed account verified'; end if;
 begin perform public.orbit_market('{"type":"browse","kind":"sale","section":"browse"}'); raise exception 'Unconfirmed account browsed'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000005',true);
do $$ begin if (public.orbit_market('{"type":"identity"}')->>'eligible')::boolean then raise exception 'Editable metadata verified membership'; end if; end; $$;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select public.orbit_market_photo('{"type":"reserve","id":"90000000-0000-4000-8000-000000000011","name":"book.jpg","mime":"image/jpeg","size":100}');
insert into storage.objects(bucket_id,name,metadata) values('orbit-market-photos','90000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000011','{"mimetype":"image/jpeg","size":100}');
select public.orbit_market_photo('{"type":"reserve","id":"90000000-0000-4000-8000-000000000012","name":"cover.png","mime":"image/png","size":150}');
insert into storage.objects(bucket_id,name,metadata) values('orbit-market-photos','90000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000012','{"mimetype":"image/png","size":150}');
-- A mismatched object cannot be bound even when the browser claims upload completion.
select public.orbit_market_photo('{"type":"reserve","id":"90000000-0000-4000-8000-000000000013","name":"wrong.jpg","mime":"image/jpeg","size":100}');
insert into storage.objects(bucket_id,name,metadata) values('orbit-market-photos','90000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000013','{"mimetype":"text/html","size":100}');
do $$ declare input jsonb:='{"type":"publish","listing":{"id":"90000000-0000-4000-8000-000000000021","kind":"sale","title":"BIO 101 textbook","description":"A clean introductory biology textbook for campus pickup.","category":"Textbooks & Course Materials","price":2500,"condition":"Good","pickup":"On Campus","area":"Library entrance","availability":"Weekdays","textbook":{"course":"BIO 101","isbn":"","edition":"12"},"photoIds":["90000000-0000-4000-8000-000000000011","90000000-0000-4000-8000-000000000012"],"status":"available","rulesAccepted":true}}'; v jsonb; begin
 begin perform public.orbit_market(jsonb_set(input,'{listing,photoIds}','["90000000-0000-4000-8000-000000000013"]')); raise exception 'Wrong MIME bound'; exception when invalid_parameter_value then null; end;
 begin perform public.orbit_market(jsonb_set(input,'{listing,photoIds}','[]')); raise exception 'Sale without photos accepted'; exception when invalid_parameter_value then null; end;
 v:=public.orbit_market(input);
 if v->'owner'->>'id'<>auth.uid()::text or (select count(*) from jsonb_object_keys(v->'owner'))<>3 or jsonb_array_length(v->'photos')<>2 then raise exception 'Unsafe seller projection or missing photos'; end if;
 perform public.orbit_market(input); -- Retry updates the same listing, never creates duplicates.
 if (select count(*) from public.orbit_market_listings)<>1 then raise exception 'Publishing not idempotent'; end if;
 begin perform public.orbit_market(jsonb_set(input,'{listing,title}','"A firearm for sale"')); raise exception 'Prohibited item accepted'; exception when sqlstate 'P0006' then null; end;
 v:=public.orbit_market(jsonb_set(input,'{listing,photoIds}','["90000000-0000-4000-8000-000000000012","90000000-0000-4000-8000-000000000011"]'));
 if v->'photos'->0->>'id'<>'90000000-0000-4000-8000-000000000012' then raise exception 'Cover photo order not saved'; end if;
 begin update public.orbit_market_listings set owner_id='90000000-0000-4000-8000-000000000002'; raise exception 'Direct write allowed'; exception when insufficient_privilege then null; end;
end; $$;
select public.orbit_market('{"type":"publish","listing":{"id":"90000000-0000-4000-8000-000000000022","kind":"wanted","title":"Looking for calculator","description":"Looking for a good graphing calculator for statistics.","category":"Electronics","price":4000,"condition":null,"pickup":null,"area":"","availability":null,"textbook":{"course":"","isbn":"","edition":""},"photoIds":[],"status":"active","rulesAccepted":true}}');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
do $$ declare v jsonb; cid uuid; begin
 v:=public.orbit_market('{"type":"browse","kind":"sale","section":"browse","q":"biology","category":null,"min":2000,"max":3000,"pickup":"On Campus","condition":"Good","availability":"Weekdays","sort":"price_low","offset":0}');
 if jsonb_array_length(v->'listings')<>1 then raise exception 'Search or filters failed'; end if;
 if (select count(*) from public.orbit_market_photos where listing_id is not null)<>2 or (select count(*) from storage.objects where bucket_id='orbit-market-photos')<>2 then raise exception 'Campus photo access failed or draft leaked'; end if;
 perform public.orbit_market('{"type":"save","id":"90000000-0000-4000-8000-000000000021","saved":true}');
 perform public.orbit_market('{"type":"save","id":"90000000-0000-4000-8000-000000000021","saved":true}');
 if (select count(*) from public.orbit_market_saves)<>1 then raise exception 'Save not idempotent'; end if;
 begin perform public.orbit_market('{"type":"delete","id":"90000000-0000-4000-8000-000000000021"}'); raise exception 'Other student deleted listing'; exception when insufficient_privilege then null; end;
 v:=public.orbit_market('{"type":"detail","id":"90000000-0000-4000-8000-000000000021"}');
 v:=(v-'owner'-'university'-'saved'-'createdAt'-'photos')||jsonb_build_object('photoIds',jsonb_build_array('90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000012'),'rulesAccepted',true);
 begin perform public.orbit_market(jsonb_build_object('type','publish','listing',v)); raise exception 'Other student edited listing'; exception when insufficient_privilege then null; end;
 cid:=(public.orbit_market('{"type":"contact","id":"90000000-0000-4000-8000-000000000021"}')->>'id')::uuid;
 if (public.orbit_market('{"type":"contact","id":"90000000-0000-4000-8000-000000000021"}')->>'id')::uuid<>cid then raise exception 'Contact created duplicate conversation'; end if;
 perform public.orbit_market(jsonb_build_object('type','send','id',cid,'messageId','90000000-0000-4000-8000-000000000031','body','Is this still available?'));
 perform public.orbit_market(jsonb_build_object('type','send','id',cid,'messageId','90000000-0000-4000-8000-000000000031','body','Is this still available?'));
 if jsonb_array_length(public.orbit_market(jsonb_build_object('type','messages','id',cid,'before',null))->'messages')<>1 then raise exception 'Message retry duplicated'; end if;
 perform public.orbit_market('{"type":"report","id":"90000000-0000-4000-8000-000000000021","reason":"Other","detail":"Test report"}');
 begin perform 1 from public.orbit_market_reports; raise exception 'Student read private reports'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000006',true);
do $$ declare cid uuid; begin
 if exists(select 1 from public.orbit_market_conversations) or exists(select 1 from public.orbit_market_messages) or exists(select 1 from public.orbit_market_saves) then raise exception 'Unrelated student read private data'; end if;
end; $$;
-- Check RPC privacy using the actual id, selected only in the administrator test context.
reset role;
select set_config('orbit.test.market_chat',(select id::text from public.orbit_market_conversations where buyer_id='90000000-0000-4000-8000-000000000002'),true);
set local role authenticated;
do $$ begin
 begin perform public.orbit_market(jsonb_build_object('type','messages','id',current_setting('orbit.test.market_chat'),'before',null)); raise exception 'Unrelated student read inquiry RPC'; exception when insufficient_privilege then null; end;
 begin perform public.orbit_market(jsonb_build_object('type','send','id',current_setting('orbit.test.market_chat'),'messageId',gen_random_uuid(),'body','Forged response')); raise exception 'Unrelated student sent message'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.orbit_market_listings) or exists(select 1 from public.orbit_market_photos) or exists(select 1 from storage.objects where bucket_id='orbit-market-photos') then raise exception 'Cross-campus data or photos leaked'; end if;
 begin perform public.orbit_market('{"type":"detail","id":"90000000-0000-4000-8000-000000000021"}'); raise exception 'Cross-campus detail leaked'; exception when no_data_found then null; end;
 begin perform public.orbit_market('{"type":"contact","id":"90000000-0000-4000-8000-000000000021"}'); raise exception 'Cross-campus contact accepted'; exception when no_data_found then null; end;
 begin perform public.orbit_market_photo('{"type":"info","id":"90000000-0000-4000-8000-000000000011"}'); raise exception 'Cross-campus photo RPC leaked'; exception when no_data_found then null; end;
end; $$;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
do $$ declare cid uuid:=current_setting('orbit.test.market_chat')::uuid; v jsonb; i integer; begin
 perform public.orbit_market(jsonb_build_object('type','send','id',cid,'messageId',gen_random_uuid(),'body','Yes, available at the library.'));
 -- Administrator fixtures for a history longer than one page; no rate-limit bypass in the public API.
end; $$;
reset role;
insert into public.orbit_market_messages(id,conversation_id,author_id,body) select gen_random_uuid(),current_setting('orbit.test.market_chat')::uuid,'90000000-0000-4000-8000-000000000002','History '||g from generate_series(1,55) g;
set local role authenticated;
do $$ declare v jsonb; older jsonb; begin
 v:=public.orbit_market(jsonb_build_object('type','messages','id',current_setting('orbit.test.market_chat'),'before',null));
 if jsonb_array_length(v->'messages')<>50 or not (v->>'hasMore')::boolean then raise exception 'Message pagination failed'; end if;
 older:=public.orbit_market(jsonb_build_object('type','messages','id',current_setting('orbit.test.market_chat'),'before',v->'messages'->0->>'id'));
 if jsonb_array_length(older->'messages')<>7 or (older->>'hasMore')::boolean then raise exception 'Older message cursor failed'; end if;
 perform public.orbit_market('{"type":"delete","id":"90000000-0000-4000-8000-000000000021"}');
 if exists(select 1 from public.orbit_market_listings where id='90000000-0000-4000-8000-000000000021') then raise exception 'Deleted listing visible'; end if;
 if not (public.orbit_market('{"type":"conversations","offset":0}')->'conversations'->0->>'removed')::boolean then raise exception 'Inquiry lost removed status'; end if;
end; $$;
reset role;
-- Revoking school-email proof must immediately revoke marketplace and Storage access.
update auth.users set email='changed@example.com' where id='90000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.orbit_market_listings) or exists(select 1 from storage.objects where bucket_id='orbit-market-photos') then raise exception 'Changed email retained campus access'; end if;
 begin perform public.orbit_market('{"type":"conversations","offset":0}'); raise exception 'Changed email retained inquiries'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.orbit_market('{"type":"identity"}'); raise exception 'Anonymous market RPC access'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
