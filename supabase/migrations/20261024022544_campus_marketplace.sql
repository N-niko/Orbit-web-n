-- Campus identity comes from Auth's confirmed email, never editable profile metadata.
create table orbit_private.market_campuses (id text primary key, name text not null, domain text not null unique);
insert into orbit_private.market_campuses values ('caldwell','Caldwell University','caldwell.edu');
revoke all on orbit_private.market_campuses from public,anon,authenticated;
alter table orbit_private.market_campuses enable row level security;
create function orbit_private.market_campus() returns text language sql stable security definer set search_path='' as $$
 select c.id from auth.users u join orbit_private.market_campuses c on c.domain=lower(split_part(u.email,'@',2))
 where u.id=auth.uid() and u.email_confirmed_at is not null;
$$;

create table public.orbit_market_listings (
 id uuid primary key, owner_id uuid not null references public.orbit_profiles(id) on delete cascade,
 campus_id text not null references orbit_private.market_campuses(id), kind text not null check(kind in ('sale','wanted')),
 title text not null check(char_length(btrim(title)) between 3 and 100), description text not null check(char_length(btrim(description)) between 10 and 3000),
 category text not null check(category in ('Textbooks & Course Materials','Electronics','Dorm & Furniture','Clothing & Accessories','School Supplies','Sports & Hobbies','Free Stuff','Other')),
 price integer check(price between 0 and 100000000), condition text check(condition in ('New','Like new','Good','Fair')),
 pickup text check(pickup in ('On Campus','Near Campus','Flexible')), area text not null default '' check(char_length(area)<=100),
 availability text check(availability in ('On campus today','Weekdays','Weekends','Flexible schedule')),
 course text not null default '' check(char_length(course)<=40), isbn text not null default '' check(char_length(isbn)<=24), edition text not null default '' check(char_length(edition)<=40),
 status text not null, deleted boolean not null default false, blocked boolean not null default false,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 check((kind='sale' and price is not null and condition is not null and pickup is not null and status in ('available','reserved','sold')) or (kind='wanted' and status in ('active','fulfilled'))),
 check(kind<>'sale' or pickup='Flexible' or char_length(btrim(area))>0),
 check(kind<>'sale' or category<>'Free Stuff' or price=0),
 check(category='Textbooks & Course Materials' or (course='' and isbn='' and edition='')));
create index market_browse_idx on public.orbit_market_listings(campus_id,kind,created_at desc,id desc) where not deleted and not blocked;
create index market_price_idx on public.orbit_market_listings(campus_id,kind,price) where not deleted and not blocked;
create index market_owner_idx on public.orbit_market_listings(owner_id,created_at);
create index market_category_idx on public.orbit_market_listings(campus_id,category);

create table public.orbit_market_photos (
 id uuid primary key,owner_id uuid not null references public.orbit_profiles(id) on delete cascade,
 listing_id uuid references public.orbit_market_listings(id) on delete cascade, position integer not null default 0 check(position between 0 and 3),
 path text not null unique, name text not null check(char_length(name) between 1 and 240), mime text not null check(mime in ('image/jpeg','image/png','image/webp','image/gif')),
 size integer not null check(size between 1 and 5242880), created_at timestamptz not null default clock_timestamp(),check(path=owner_id::text||'/'||id::text));
create index market_photos_owner_idx on public.orbit_market_photos(owner_id,created_at);
create index market_photos_listing_idx on public.orbit_market_photos(listing_id,position);
create table public.orbit_market_saves (listing_id uuid not null references public.orbit_market_listings(id) on delete cascade,profile_id uuid not null references public.orbit_profiles(id) on delete cascade,primary key(listing_id,profile_id));
create index market_saves_profile_idx on public.orbit_market_saves(profile_id);
create table public.orbit_market_conversations (
 id uuid primary key default gen_random_uuid(),listing_id uuid not null references public.orbit_market_listings(id),
 buyer_id uuid not null references public.orbit_profiles(id) on delete cascade, seller_id uuid not null references public.orbit_profiles(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(listing_id,buyer_id),check(buyer_id<>seller_id));
create index market_conversation_buyer_idx on public.orbit_market_conversations(buyer_id,updated_at desc);
create index market_conversation_seller_idx on public.orbit_market_conversations(seller_id,updated_at desc);
create table public.orbit_market_messages (id uuid primary key,conversation_id uuid not null references public.orbit_market_conversations(id) on delete cascade,
 author_id uuid not null references public.orbit_profiles(id) on delete cascade,body text not null check(char_length(btrim(body)) between 1 and 2000),created_at timestamptz not null default clock_timestamp());
create index market_messages_page_idx on public.orbit_market_messages(conversation_id,created_at desc,id desc);
create index market_messages_rate_idx on public.orbit_market_messages(author_id,created_at);
create table public.orbit_market_reports (listing_id uuid not null references public.orbit_market_listings(id),reporter_id uuid not null references public.orbit_profiles(id) on delete cascade,
 reason text not null check(reason in ('Prohibited item','Suspected scam','Inappropriate content','Other')),detail text not null check(char_length(detail)<=500),created_at timestamptz not null default clock_timestamp(),primary key(listing_id,reporter_id));
create index market_reports_reporter_idx on public.orbit_market_reports(reporter_id,created_at);

create function orbit_private.market_read(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.orbit_market_listings l where l.id=p_id and l.campus_id=orbit_private.market_campus() and not l.deleted and not l.blocked);
$$;
create function orbit_private.market_chat_read(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.orbit_market_conversations c join public.orbit_market_listings l on l.id=c.listing_id
 where c.id=p_id and auth.uid() in(c.buyer_id,c.seller_id) and l.campus_id=orbit_private.market_campus() and not l.blocked);
$$;
create function orbit_private.market_photo_allowed(p_path text,p_write boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select orbit_private.market_campus() is not null and exists(select 1 from public.orbit_market_photos p where p.path=p_path and
 ((p.owner_id=auth.uid() and p.listing_id is null and (not p_write or p.created_at>now()-interval '1 day')) or
 (not p_write and p.listing_id is not null and orbit_private.market_read(p.listing_id))));
$$;
alter table public.orbit_market_listings enable row level security;
alter table public.orbit_market_photos enable row level security;
alter table public.orbit_market_saves enable row level security;
alter table public.orbit_market_conversations enable row level security;
alter table public.orbit_market_messages enable row level security;
alter table public.orbit_market_reports enable row level security;
revoke all on public.orbit_market_listings,public.orbit_market_photos,public.orbit_market_saves,public.orbit_market_conversations,public.orbit_market_messages,public.orbit_market_reports from public,anon,authenticated;
grant select on public.orbit_market_listings,public.orbit_market_photos,public.orbit_market_saves,public.orbit_market_conversations,public.orbit_market_messages to authenticated;
create policy market_listing_read on public.orbit_market_listings for select to authenticated using(campus_id=(select orbit_private.market_campus()) and not deleted and not blocked);
create policy market_photo_read on public.orbit_market_photos for select to authenticated using((owner_id=(select auth.uid()) and listing_id is null) or orbit_private.market_read(listing_id));
create policy market_save_read on public.orbit_market_saves for select to authenticated using(profile_id=(select auth.uid()) and orbit_private.market_read(listing_id));
create policy market_conversation_read on public.orbit_market_conversations for select to authenticated using(orbit_private.market_chat_read(id));
create policy market_message_read on public.orbit_market_messages for select to authenticated using(orbit_private.market_chat_read(conversation_id));
-- Reports are visible only to project administrators, not other students.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('orbit-market-photos','orbit-market-photos',false,5242880,array['image/jpeg','image/png','image/webp','image/gif']);
create policy market_photo_upload on storage.objects for insert to authenticated with check(bucket_id='orbit-market-photos' and orbit_private.market_photo_allowed(name,true));
create policy market_photo_download on storage.objects for select to authenticated using(bucket_id='orbit-market-photos' and orbit_private.market_photo_allowed(name,false));
create policy market_photo_discard on storage.objects for delete to authenticated using(bucket_id='orbit-market-photos' and exists(select 1 from public.orbit_market_photos p where p.path=name and p.owner_id=(select auth.uid()) and p.listing_id is null));

create function orbit_private.market_listing_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',l.id,'kind',l.kind,'title',l.title,'description',l.description,'category',l.category,'price',l.price,'condition',l.condition,'pickup',l.pickup,'area',l.area,'availability',l.availability,
 'textbook',jsonb_build_object('course',l.course,'isbn',l.isbn,'edition',l.edition),'status',l.status,'createdAt',l.created_at,
 'owner',jsonb_build_object('id',p.id,'name',p.name,'color',p.color),'university',c.name,
 'saved',exists(select 1 from public.orbit_market_saves s where s.listing_id=l.id and s.profile_id=auth.uid()),
 'photos',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',f.size) order by f.position,f.id) from public.orbit_market_photos f where f.listing_id=l.id),'[]'::jsonb))
 from public.orbit_market_listings l join public.orbit_profiles p on p.id=l.owner_id join orbit_private.market_campuses c on c.id=l.campus_id where l.id=p_id;
$$;

create function orbit_private.market(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); campus text:=orbit_private.market_campus(); t text:=p_action->>'type'; v jsonb:=p_action->'listing'; l public.orbit_market_listings;
 f public.orbit_market_photos; c public.orbit_market_conversations; mid uuid; existing public.orbit_market_messages; ids uuid[]; result jsonb; more boolean; off integer; stamp timestamptz;
begin
 if u is null then raise exception 'Sign in' using errcode='42501'; end if;
 if t='identity' then return jsonb_build_object('eligible',campus is not null,'university',(select name from orbit_private.market_campuses where id=campus),'domain','caldwell.edu'); end if;
 if campus is null then raise exception 'Confirm your campus email' using errcode='42501'; end if;
 if t='browse' then
  off:=coalesce((p_action->>'offset')::integer,0);
  if off not between 0 and 10000 or length(coalesce(p_action->>'q',''))>100 then raise exception 'Invalid search' using errcode='22023'; end if;
  with candidates as (select a.* from public.orbit_market_listings a where a.campus_id=campus and not a.deleted and not a.blocked
   and a.kind=p_action->>'kind' and case when p_action->>'section'='mine' then a.owner_id=u when p_action->>'section'='saved' then true else a.status in('available','reserved','active') end
   and (p_action->>'section'<>'saved' or exists(select 1 from public.orbit_market_saves s where s.listing_id=a.id and s.profile_id=u))
   and (coalesce(p_action->>'q','')='' or position(lower(p_action->>'q') in lower(a.title||' '||a.description))>0)
   and (p_action->>'category' is null or a.category=p_action->>'category') and (p_action->>'condition' is null or a.condition=p_action->>'condition')
   and (p_action->>'pickup' is null or a.pickup=p_action->>'pickup') and (p_action->>'availability' is null or a.availability=p_action->>'availability')
   and (p_action->>'min' is null or a.price>=(p_action->>'min')::integer) and (p_action->>'max' is null or a.price<=(p_action->>'max')::integer)
   order by case when p_action->>'sort'='price_low' then a.price end asc nulls last,case when p_action->>'sort'='price_high' then a.price end desc nulls last,a.created_at desc,a.id desc limit 25 offset off),
  page as(select *,row_number() over(order by case when p_action->>'sort'='price_low' then price end asc nulls last,case when p_action->>'sort'='price_high' then price end desc nulls last,created_at desc,id desc) n from candidates)
  select coalesce((select jsonb_agg(orbit_private.market_listing_json(id) order by n) from page where n<=24),'[]'::jsonb),(select count(*)>24 from page) into result,more;
  return jsonb_build_object('listings',result,'hasMore',more);
 end if;
 if t='publish' then
  perform 1 from public.orbit_profiles where id=u for update;
  if v->>'rulesAccepted'<>'true' or v->>'rulesAccepted' is null then raise exception 'Accept item rules' using errcode='22023'; end if;
  if lower((v->>'title')||' '||(v->>'description')) ~ '\m(guns?|firearms?|weapons?|pistols?|rifles?|shotguns?|ammunition|explosives?|cocaine|heroin|marijuana|vapes?|cigarettes?|tobacco|vodka|whiskey|liquor|stolen|counterfeit)\M'
   then raise exception 'Prohibited item' using errcode='P0006'; end if;
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(v->'photoIds');
  if cardinality(ids)>4 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or (v->>'kind'='sale' and cardinality(ids)=0) then raise exception 'Invalid photos' using errcode='22023'; end if;
  select * into l from public.orbit_market_listings where id=(v->>'id')::uuid for update;
  if found then
   if l.owner_id<>u or l.campus_id<>campus or l.deleted or l.blocked or l.kind<>v->>'kind' then raise exception 'Listing unavailable' using errcode='42501'; end if;
  else
   if (select count(*) from public.orbit_market_listings where owner_id=u and created_at>now()-interval '1 day')>=10 or
    (select count(*) from public.orbit_market_listings where owner_id=u and not deleted and status in('available','reserved','active'))>=100 then raise exception 'Listing allowance' using errcode='P0004'; end if;
  end if;
  perform 1 from public.orbit_market_photos where id=any(ids) for update;
  if (select count(*) from public.orbit_market_photos p where p.id=any(ids) and p.owner_id=u and (p.listing_id is null or p.listing_id=(v->>'id')::uuid)
    and exists(select 1 from storage.objects o where o.bucket_id='orbit-market-photos' and o.name=p.path and (o.metadata->>'size')::bigint=p.size and o.metadata->>'mimetype'=p.mime))<>cardinality(ids)
    then raise exception 'Invalid or unfinished photo upload' using errcode='22023'; end if;
  insert into public.orbit_market_listings(id,owner_id,campus_id,kind,title,description,category,price,condition,pickup,area,availability,course,isbn,edition,status)
  values((v->>'id')::uuid,u,campus,v->>'kind',btrim(v->>'title'),btrim(v->>'description'),v->>'category',(v->>'price')::integer,v->>'condition',v->>'pickup',btrim(v->>'area'),v->>'availability',btrim(v#>>'{textbook,course}'),btrim(v#>>'{textbook,isbn}'),btrim(v#>>'{textbook,edition}'),v->>'status')
  on conflict(id) do update set title=excluded.title,description=excluded.description,category=excluded.category,price=excluded.price,condition=excluded.condition,pickup=excluded.pickup,area=excluded.area,availability=excluded.availability,course=excluded.course,isbn=excluded.isbn,edition=excluded.edition,status=excluded.status,updated_at=clock_timestamp()
  where orbit_market_listings.owner_id=u and orbit_market_listings.campus_id=campus and not orbit_market_listings.deleted and not orbit_market_listings.blocked and orbit_market_listings.kind=excluded.kind;
  if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
  update public.orbit_market_photos set listing_id=null where listing_id=(v->>'id')::uuid and not(id=any(ids));
  update public.orbit_market_photos set listing_id=(v->>'id')::uuid,position=array_position(ids,id)-1 where id=any(ids);
  return orbit_private.market_listing_json((v->>'id')::uuid);
 end if;
 if t in('detail','delete','save','contact','report') then
  select * into l from public.orbit_market_listings where id=(p_action->>'id')::uuid for update;
  if not found or not orbit_private.market_read(l.id) then raise exception 'Listing unavailable' using errcode='P0002'; end if;
  if t='detail' then return orbit_private.market_listing_json(l.id); end if;
  if t='delete' then
   if l.owner_id<>u then raise exception 'Not your listing' using errcode='42501'; end if;
   update public.orbit_market_listings set deleted=true,updated_at=clock_timestamp() where id=l.id;
   update public.orbit_market_photos set listing_id=null where listing_id=l.id;
  elsif t='save' then
   if (p_action->>'saved')::boolean then insert into public.orbit_market_saves values(l.id,u) on conflict do nothing;
   else delete from public.orbit_market_saves where listing_id=l.id and profile_id=u; end if;
  elsif t='contact' then
   if l.owner_id=u then raise exception 'Your own listing' using errcode='22023'; end if;
   select * into c from public.orbit_market_conversations where listing_id=l.id and buyer_id=u;
   if not found then
    if l.status not in('available','reserved','active') then raise exception 'Listing closed' using errcode='22023'; end if;
    perform 1 from public.orbit_profiles where id=u for update;
    if (select count(*) from public.orbit_market_conversations where buyer_id=u and created_at>now()-interval '1 day')>=20 then raise exception 'Inquiry limit' using errcode='P0004'; end if;
    insert into public.orbit_market_conversations(listing_id,buyer_id,seller_id) values(l.id,u,l.owner_id) returning * into c;
   end if;
   return jsonb_build_object('id',c.id);
  else
   perform 1 from public.orbit_profiles where id=u for update;
   if (select count(*) from public.orbit_market_reports where reporter_id=u and created_at>now()-interval '1 day')>=20 then raise exception 'Report limit' using errcode='P0004'; end if;
   insert into public.orbit_market_reports(listing_id,reporter_id,reason,detail) values(l.id,u,p_action->>'reason',coalesce(p_action->>'detail','')) on conflict(listing_id,reporter_id) do update set reason=excluded.reason,detail=excluded.detail;
  end if;
  return jsonb_build_object('ok',true);
 end if;
 if t='conversations' then
  off:=coalesce((p_action->>'offset')::integer,0); if off not between 0 and 10000 then raise exception 'Invalid page' using errcode='22023'; end if;
  with page as(select a.*,row_number() over(order by a.updated_at desc,a.id desc) n from public.orbit_market_conversations a where orbit_private.market_chat_read(a.id) order by a.updated_at desc,a.id desc limit 31 offset off)
  select coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'listingId',item.id,'title',item.title,'removed',item.deleted,'updatedAt',a.updated_at,'other',jsonb_build_object('id',p.id,'name',p.name,'color',p.color)) order by a.updated_at desc,a.id desc)
   from page a join public.orbit_market_listings item on item.id=a.listing_id join public.orbit_profiles p on p.id=case when a.buyer_id=u then a.seller_id else a.buyer_id end where a.n<=off+30),'[]'::jsonb),(select count(*)>30 from page) into result,more;
  return jsonb_build_object('conversations',result,'hasMore',more);
 end if;
 if t in('messages','send') then
  select * into c from public.orbit_market_conversations where id=(p_action->>'id')::uuid for update;
  if not found or not orbit_private.market_chat_read(c.id) then raise exception 'Conversation unavailable' using errcode='42501'; end if;
  if t='send' then
   mid:=(p_action->>'messageId')::uuid;
   select * into existing from public.orbit_market_messages where id=mid;
   if found then
    if existing.author_id<>u or existing.conversation_id<>c.id or existing.body<>btrim(p_action->>'body') then raise exception 'Message conflicts' using errcode='22023'; end if;
   else
    perform 1 from public.orbit_profiles where id=u for update;
    if (select count(*) from public.orbit_market_messages where author_id=u and created_at>now()-interval '1 minute')>=30 then raise exception 'Sending quickly' using errcode='P0001'; end if;
    insert into public.orbit_market_messages(id,conversation_id,author_id,body) values(mid,c.id,u,btrim(p_action->>'body'));
    update public.orbit_market_conversations set updated_at=clock_timestamp() where id=c.id;
   end if;
   return jsonb_build_object('ok',true);
  end if;
  if p_action->>'before' is not null then
   select created_at into stamp from public.orbit_market_messages where id=(p_action->>'before')::uuid and conversation_id=c.id;
   if not found then raise exception 'Invalid cursor' using errcode='22023'; end if;
  end if;
  with page as(select *,row_number() over(order by created_at desc,id desc) n from public.orbit_market_messages where conversation_id=c.id and (stamp is null or (created_at,id)<(stamp,(p_action->>'before')::uuid)) order by created_at desc,id desc limit 51)
  select coalesce((select jsonb_agg(jsonb_build_object('id',id,'authorId',author_id,'body',body,'createdAt',created_at) order by created_at,id) from page where n<=50),'[]'::jsonb),(select count(*)>50 from page) into result,more;
  return jsonb_build_object('messages',result,'hasMore',more);
 end if;
 raise exception 'Invalid action' using errcode='22023';
end; $$;

create function orbit_private.market_photo(p_action jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); f public.orbit_market_photos; mid uuid:=(p_action->>'id')::uuid; t text:=p_action->>'type'; begin
 if u is null or orbit_private.market_campus() is null then raise exception 'Confirm campus email' using errcode='42501'; end if;
 if t='reserve' then
  perform 1 from public.orbit_profiles where id=u for update;
  if mid is null or p_action->>'name' is null or p_action->>'name' ~ '[[:cntrl:]/]' or position(chr(92) in p_action->>'name')>0 or lower(p_action->>'name') !~ '[.](jpe?g|png|webp|gif)$' then raise exception 'Invalid photo' using errcode='22023'; end if;
  select * into f from public.orbit_market_photos where id=mid;
  if found then
   if f.owner_id<>u or f.listing_id is not null or f.name<>p_action->>'name' or f.mime<>p_action->>'mime' or f.size<>(p_action->>'size')::integer then raise exception 'Photo conflicts' using errcode='22023'; end if;
  else
   if (select count(*) from public.orbit_market_photos where owner_id=u and created_at>now()-interval '1 day')>=40 or (select coalesce(sum(size),0) from public.orbit_market_photos where owner_id=u)+(p_action->>'size')::integer>104857600 then raise exception 'Photo allowance' using errcode='P0005'; end if;
   insert into public.orbit_market_photos(id,owner_id,path,name,mime,size) values(mid,u,u::text||'/'||mid::text,p_action->>'name',p_action->>'mime',(p_action->>'size')::integer) returning * into f;
  end if;
 elsif t='release' then
  delete from public.orbit_market_photos p where p.id=mid and p.owner_id=u and p.listing_id is null and not exists(select 1 from storage.objects o where o.bucket_id='orbit-market-photos' and o.name=p.path);
  return jsonb_build_object('released',found);
 elsif t='info' then
  select * into f from public.orbit_market_photos where id=mid;
  if not found or not orbit_private.market_photo_allowed(f.path,false) then raise exception 'Photo unavailable' using errcode='P0002'; end if;
 else raise exception 'Invalid action' using errcode='22023'; end if;
 return jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',f.size,'path',f.path,'pending',f.listing_id is null);
end; $$;

create function public.orbit_market(p_action jsonb) returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.market(p_action); $$;
create function public.orbit_market_photo(p_action jsonb) returns jsonb language sql security invoker set search_path='' as $$ select orbit_private.market_photo(p_action); $$;
revoke all on function orbit_private.market_listing_json(uuid),orbit_private.market_campus(),orbit_private.market_read(uuid),orbit_private.market_chat_read(uuid),orbit_private.market_photo_allowed(text,boolean),orbit_private.market(jsonb),orbit_private.market_photo(jsonb),public.orbit_market(jsonb),public.orbit_market_photo(jsonb) from public,anon,authenticated;
grant execute on function orbit_private.market_campus(),orbit_private.market_read(uuid),orbit_private.market_chat_read(uuid),orbit_private.market_photo_allowed(text,boolean),orbit_private.market(jsonb),orbit_private.market_photo(jsonb),public.orbit_market(jsonb),public.orbit_market_photo(jsonb) to authenticated;
notify pgrst,'reload schema';
