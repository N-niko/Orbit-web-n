"use client";
import { OrbitSelect } from "./orbit-select";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ArrowLeft, ArrowUpRight, Bookmark, Check, ChevronRight, Flag, ImageIcon, MapPin, MessageCircle, Plus, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Trash2, X } from "lucide-react";
import { z } from "zod";
import type { Profile } from "@/lib/types";
import { defaultMarketFilters, listingInputSchema, marketAvailability, marketCategories, marketConditions, marketConversationsSchema, marketIdentitySchema, marketListingSchema, marketMessagesSchema, marketPageSchema, marketPhotoBucket, marketPhotoUrl, marketPickup, marketPrice, marketRules, type ListingInput, type MarketAction, type MarketConversation, type MarketFilters, type MarketIdentity, type MarketListing, type MarketMessage } from "@/lib/marketplace";
import { applyDemoMarket, type DemoMarket } from "@/lib/marketplace-demo";
import { postJson, type Attachment } from "@/lib/post-social";
import { AttachmentPicker } from "./post-attachments";
import { ViewModal } from "./secondary-shared";
import "./secondary.css";
import "./marketplace.css";

async function onlineMarket(action: MarketAction, signal?: AbortSignal): Promise<unknown> {
 const response = await fetch("/api/marketplace", { ...postJson(action), signal, cache: "no-store" });
 const result = await response.json().catch(() => ({ error: "Marketplace could not load. Please try again." }));
 if (!response.ok) throw new Error(result.error || "Marketplace could not save your changes.");
 return result;
}
const actionError = (cause: unknown) => cause instanceof z.ZodError ? "Marketplace returned incomplete details. Please try again." : cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
type Execute = (action: MarketAction, signal?: AbortSignal, photos?: Attachment[]) => Promise<unknown>;
type Props = { profile: Profile; demo: boolean; demoData: DemoMarket; onDemoChange: Dispatch<SetStateAction<DemoMarket>>; selectedId: string | null; onSelect: (id: string | null) => void; createRequested: boolean; onCreateHandled: () => void; onProfile: (listing: MarketListing) => void; notify: (message: string) => void };

export function MarketplaceView({ profile, demo, demoData, onDemoChange, selectedId, onSelect, createRequested, onCreateHandled, onProfile, notify }: Props) {
 const demoRef = useRef(demoData); demoRef.current = demoData;
 const [identity, setIdentity] = useState<MarketIdentity | null>(demo ? { eligible: true, university: profile.university, domain: "caldwell.edu" } : null);
 const [filters, setFilters] = useState<MarketFilters>({ ...defaultMarketFilters });
 const [listings, setListings] = useState<MarketListing[]>([]);
 const [hasMore, setHasMore] = useState(false);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");
 const [retry, setRetry] = useState(0);
 const [selected, setSelected] = useState<MarketListing | null>(null);
 const [form, setForm] = useState<{ kind: "sale" | "wanted"; listing?: MarketListing } | null>(null);
 const [tab, setTab] = useState<"browse" | "saved" | "mine" | "inquiries">("browse");
 const [conversation, setConversation] = useState<MarketConversation | null>(null);
 const [busy, setBusy] = useState(false);
 const [reporting, setReporting] = useState(false);
 const [deleting, setDeleting] = useState(false);
 const execute: Execute = useCallback(async (action, signal, photos) => {
  if (!demo) return onlineMarket(action, signal);
  const applied = applyDemoMarket(demoRef.current, action, profile);
  if (action.type === "publish" && photos) {
   const listing = applied.result as MarketListing;
   listing.photos = photos;
   applied.state = { ...applied.state, listings: applied.state.listings.map(l => l.id === listing.id ? listing : l) };
  }
  demoRef.current = applied.state; onDemoChange(applied.state); return applied.result;
 }, [demo, profile, onDemoChange]);
 // Read-only demo actions do not replace state; otherwise loading would retrigger itself.
 const read = useCallback((action: MarketAction, signal?: AbortSignal) => demo ? Promise.resolve(applyDemoMarket(demoRef.current, action, profile).result) : onlineMarket(action, signal), [demo, profile]);
 useEffect(() => {
  const controller = new AbortController(); setError("");
  void read({ type: "identity" }, controller.signal).then(value => {
   if (controller.signal.aborted) return;
   const next = marketIdentitySchema.parse(value);
   setIdentity(current => current?.eligible === next.eligible && current.university === next.university && current.domain === next.domain ? current : next);
  }).catch(cause => { if (!controller.signal.aborted) { setError(actionError(cause)); setLoading(false); } });
  return () => controller.abort();
 }, [read, retry]);
 useEffect(() => {
  if (!identity?.eligible || selectedId || tab === "inquiries") { setLoading(false); return; }
  const controller = new AbortController(); setLoading(true); setError("");
  const timer = setTimeout(() => {
   void read({ ...filters, section: tab }, controller.signal).then(value => {
    if (controller.signal.aborted) return;
    const page = marketPageSchema.parse(value); setListings(page.listings); setHasMore(page.hasMore); setLoading(false);
   }).catch(cause => { if (!controller.signal.aborted) { setError(actionError(cause)); setLoading(false); } });
  }, 180);
  return () => { clearTimeout(timer); controller.abort(); };
 }, [read, identity?.eligible, filters, tab, selectedId, retry, demoData]);
 useEffect(() => {
  if (!selectedId || !identity?.eligible) { setSelected(null); return; }
  const controller = new AbortController(); setSelected(null); setLoading(true); setError("");
  void read({ type: "detail", id: selectedId }, controller.signal).then(value => { if (!controller.signal.aborted) { setSelected(marketListingSchema.parse(value)); setLoading(false); } }).catch(cause => { if (!controller.signal.aborted) { setError(actionError(cause)); setLoading(false); } });
  return () => controller.abort();
 }, [selectedId, identity?.eligible, read, retry]);
 useEffect(() => {
  if (createRequested && identity) { if (identity.eligible) setForm({ kind: "sale" }); onCreateHandled(); }
 }, [createRequested, identity, onCreateHandled]);
 function changeFilters(next: Partial<MarketFilters>) { setFilters(current => ({ ...current, ...next, offset: 0 })); }
 function switchTab(next: typeof tab) { setTab(next); setConversation(null); onSelect(null); setFilters(current => ({ ...current, offset: 0 })); setError(""); }
 async function action(job: () => Promise<void>) { setBusy(true); setError(""); try { await job(); } catch (cause) { setError(actionError(cause)); } finally { setBusy(false); } }
 async function save(listing: MarketListing) {
  await execute({ type: "save", id: listing.id, saved: !listing.saved });
  setListings(current => current.map(l => l.id === listing.id ? { ...l, saved: !l.saved } : l));
  setSelected(current => current?.id === listing.id ? { ...current, saved: !current.saved } : current);
  notify(listing.saved ? "Listing removed from saved items." : "Listing saved.");
 }
 async function contact(listing: MarketListing) {
  const result = z.object({ id: z.uuid() }).parse(await execute({ type: "contact", id: listing.id }));
  // Open this authorized conversation immediately, even when it is older than the first inbox page.
  setConversation({id:result.id,listingId:listing.id,title:listing.title,other:listing.owner,removed:false,updatedAt:new Date().toISOString()});
  onSelect(null); setTab("inquiries");
 }
 async function publish(input: ListingInput, photos: Attachment[]) {
  const next = marketListingSchema.parse(await execute({ type: "publish", listing: input }, undefined, photos));
  setSelected(next); onSelect(next.id); setForm(null); setRetry(value => value + 1); notify("Your listing is saved.");
 }
 const owner = selected?.owner.id === profile.id;
 return <section className="secondary-view marketplace-view">
  <div className="view-heading"><div><p className="eyebrow">GOOD FINDS. CLOSE TO CAMPUS.</p><h1>Marketplace<span className="brand-dot">.</span></h1><p className="muted">Pass it on. Find what you need. Meet between classes.</p></div><button className="btn btn-primary" disabled={!identity?.eligible} onClick={() => setForm({ kind: "sale" })}><Plus size={17} />Sell an item</button></div>
  {demo && <p className="market-demo-note">Demo marketplace · fictional listings and local changes only.</p>}
  {!identity && !error && <div className="market-state" role="status">Checking your campus access…</div>}
  {identity && !identity.eligible && <div className="panel market-gate"><ShieldCheck size={35} /><h2>A marketplace for your campus.</h2><p>Sign in with a confirmed <strong>@{identity.domain}</strong> email to browse, sell, and contact other students. Your selected university alone does not verify campus membership.</p><p className="muted">If you use a personal email for Orbit, create an account with your campus email and confirm the link in your inbox.</p></div>}
  {identity?.eligible && <>
   <div className="market-campus"><ShieldCheck size={16} /><span>{demo ? "Demo campus" : "Confirmed university email"} · {identity.university}</span><small>Local pickup · no payments in Orbit</small></div>
   <div className="market-tabs" aria-label="Marketplace sections">{([{id:"browse",label:"Browse"},{id:"saved",label:"Saved"},{id:"mine",label:"My Listings"},{id:"inquiries",label:"Inquiries"}] as const).map(t => <button key={t.id} aria-pressed={tab===t.id} className={tab===t.id?"active":""} onClick={()=>switchTab(t.id)}>{t.label}</button>)}</div>
   {selectedId && <button className="text-button market-back" onClick={() => { onSelect(null); setError(""); }}><ArrowLeft size={16} />Back to Marketplace</button>}
   {tab !== "inquiries" && !selectedId && <>
    <div className="market-kind"><button aria-pressed={filters.kind==="sale"} onClick={()=>changeFilters({kind:"sale"})}>Items for sale</button><button aria-pressed={filters.kind==="wanted"} onClick={()=>changeFilters({kind:"wanted",condition:null,pickup:null,availability:null})}>Wanted</button>{filters.kind==="wanted"&&<button className="text-button" onClick={()=>setForm({kind:"wanted"})}><Plus size={14}/>Post a request</button>}</div>
    <div className="market-search"><Search size={19}/><input aria-label="Search Marketplace" placeholder="Search books, a lamp, your next great find…" maxLength={100} value={filters.q} onChange={e=>changeFilters({q:e.target.value})}/>{filters.q&&<button className="icon-button" aria-label="Clear marketplace search" onClick={()=>changeFilters({q:""})}><X size={15}/></button>}</div>
    <div className="market-categories" aria-label="Listing categories"><button aria-pressed={!filters.category} onClick={()=>changeFilters({category:null})}>All finds</button>{marketCategories.map((category,i)=><button key={category} aria-pressed={filters.category===category} onClick={()=>changeFilters({category})}><span aria-hidden="true">{["▤","⌘","⌂","◇","✎","◉","♡","✦"][i]}</span>{category}</button>)}</div>
    <details className="market-filter-panel"><summary><SlidersHorizontal size={16}/>Pickup, price & more{[filters.pickup,filters.availability,filters.condition,filters.min,filters.max].some(v=>v!==null)&&<span>Filters applied</span>}</summary><div className="market-filter-grid">
     <label>Minimum {filters.kind==="wanted"?"budget":"price"} ($)<input type="number" min="0" step="0.01" value={filters.min===null?"":filters.min/100} onChange={e=>changeFilters({min:e.target.value===""?null:Math.max(0,Math.round(Number(e.target.value)*100))})}/></label>
     <label>Maximum {filters.kind==="wanted"?"budget":"price"} ($)<input type="number" min="0" step="0.01" value={filters.max===null?"":filters.max/100} onChange={e=>changeFilters({max:e.target.value===""?null:Math.max(0,Math.round(Number(e.target.value)*100))})}/></label>
     {filters.kind==="sale"&&<><label>Condition<OrbitSelect aria-label="Filter by condition" value={filters.condition||""} onChange={e=>changeFilters({condition:e.target.value as MarketFilters["condition"]||null})}><option value="">Any condition</option>{marketConditions.map(v=><option key={v}>{v}</option>)}</OrbitSelect></label><label>Pickup preference<OrbitSelect aria-label="Filter by pickup preference" value={filters.pickup||""} onChange={e=>changeFilters({pickup:e.target.value as MarketFilters["pickup"]||null})}><option value="">Any pickup</option>{marketPickup.map(v=><option key={v}>{v}</option>)}</OrbitSelect></label><label>Availability<OrbitSelect aria-label="Filter by availability" value={filters.availability||""} onChange={e=>changeFilters({availability:e.target.value as MarketFilters["availability"]||null})}><option value="">Any time</option>{marketAvailability.map(v=><option key={v}>{v}</option>)}</OrbitSelect></label></>}
     <button className="text-button" onClick={()=>setFilters({...defaultMarketFilters,kind:filters.kind})}>Clear filters</button>
    </div></details>
    <div className="market-results-heading"><span>{tab==="mine"?"Your listings":tab==="saved"?"Saved for later":filters.kind==="wanted"?"What your campus is looking for":"A little closer to what you need"}</span><label>Sort<OrbitSelect aria-label="Sort listings" value={filters.sort} onChange={e=>changeFilters({sort:e.target.value as MarketFilters["sort"]})}><option value="newest">Newest first</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option></OrbitSelect></label></div>
   </>}
   {loading&&<div className="market-state" role="status">Finding your campus finds…<div className="market-skeletons"><i/><i/><i/></div></div>}
   {!loading&&!selectedId&&tab!=="inquiries"&&!error&&<><div className="market-grid">{listings.map(listing=><MarketCard key={listing.id} listing={listing} busy={busy} onOpen={()=>onSelect(listing.id)} onSave={()=>{void action(()=>save(listing));}}/>)}</div>{!listings.length&&<div className="panel market-state"><ShoppingBag size={32}/><h2>{tab==="mine"?"Your first listing starts here.":tab==="saved"?"Keep your good finds here.":"A little room for a good find."}</h2><p>{tab==="saved"?"Tap the bookmark on a listing to save it.":"Try another search or category, or add something for your campus."}</p><button className="btn btn-primary" onClick={()=>setForm({kind:filters.kind})}>{filters.kind==="wanted"?"Post a request":"Sell an item"}<Plus size={15}/></button></div>}
    {(filters.offset>0||hasMore)&&<div className="market-pagination"><button className="btn btn-secondary" disabled={filters.offset===0} onClick={()=>setFilters(v=>({...v,offset:Math.max(0,v.offset-24)}))}>Previous</button><span>Page {filters.offset/24+1}</span><button className="btn btn-secondary" disabled={!hasMore} onClick={()=>setFilters(v=>({...v,offset:v.offset+24}))}>Next</button></div>}</>}
   {!loading&&selected&&<div className="market-detail"><MarketGallery photos={selected.photos}/><div className="panel market-detail-copy"><div className="market-card-tags"><span>{selected.kind==="wanted"?"Wanted":selected.status}</span>{selected.kind==="wanted"&&<span>{selected.status}</span>}{selected.condition&&<span>{selected.condition}</span>}</div><p className="eyebrow">{selected.category}</p><h2>{selected.title}</h2><strong className="market-price">{marketPrice(selected.price,selected.kind==="wanted")}</strong><p className="market-description">{selected.description}</p>
    {selected.pickup&&<div className="market-pickup"><MapPin size={18}/><div><strong>{selected.pickup}</strong><p>{selected.area||"Choose a public meeting place together"}</p>{selected.availability&&<small>{selected.availability}</small>}</div></div>}
    {selected.category===marketCategories[0]&&Object.values(selected.textbook).some(Boolean)&&<dl className="market-book-details">{Object.entries(selected.textbook).filter(([,v])=>v).map(([key,value])=><div key={key}><dt>{key==="isbn"?"ISBN":key==="course"?"Course":"Edition"}</dt><dd>{value}</dd></div>)}</dl>}
    <button className="market-seller" onClick={()=>onProfile(selected)}><span className="market-avatar" style={{background:selected.owner.color}}>{selected.owner.name.slice(0,1)}</span><span><strong>{selected.owner.name}</strong><small>{demo?"Demo campus member":"Listed with a confirmed campus email"} · {selected.university}</small></span><ChevronRight size={18}/></button>
    <div className="market-detail-actions">{owner?<><button className="btn btn-primary" disabled={busy} onClick={()=>setForm({kind:selected.kind,listing:selected})}>Edit listing</button><button className="btn btn-secondary" disabled={busy} onClick={()=>setDeleting(true)}><Trash2 size={15}/>Delete</button></>:<button className="btn btn-primary" disabled={busy||["sold","fulfilled"].includes(selected.status)} onClick={()=>{void action(()=>contact(selected));}}><MessageCircle size={16}/>Contact {selected.kind==="wanted"?"requester":"seller"}</button>}<button className="btn btn-secondary" aria-pressed={selected.saved} disabled={busy} onClick={()=>{void action(()=>save(selected));}}><Bookmark size={16} fill={selected.saved?"currentColor":"none"}/>{selected.saved?"Saved":"Save"}</button></div>
    {owner&&<div className="market-status-actions"><span>Mark as</span>{(selected.kind==="sale"?["available","reserved","sold"]:["active","fulfilled"]).map(status=><button key={status} disabled={busy||status===selected.status} aria-pressed={status===selected.status} onClick={()=>{void action(async()=>{const {owner:_,university:__,saved:___,createdAt:____,photos,...rest}=selected;await publish(listingInputSchema.parse({...rest,status,rulesAccepted:true,photoIds:photos.map(p=>p.id)}),photos);});}}>{status}</button>)}</div>}
    <p className="market-safety"><ShieldCheck size={17}/>Meet in a public campus location. Inspect items before agreeing to exchange. Orbit does not handle payments.</p>{!owner&&<button className="text-button" onClick={()=>setReporting(true)}><Flag size={14}/>Report listing</button>}
   </div></div>}
   {tab==="inquiries"&&!selectedId&&<MarketInbox key={conversation?.id||"inbox"} execute={execute} read={read} profile={profile} initialConversation={conversation} onListing={id=>{setTab("browse");onSelect(id);}} demoData={demoData}/>}
  </>}
  {error&&<div className="panel market-error" role="alert"><p>{error}</p><button className="text-button" onClick={()=>setRetry(v=>v+1)}>Try again</button></div>}
  {form&&<MarketForm kind={form.kind} listing={form.listing} demo={demo} onClose={()=>setForm(null)} onPublish={publish}/>}
  {reporting&&selected&&<ReportListing onClose={()=>setReporting(false)} onReport={async(reason,detail)=>{await execute({type:"report",id:selected.id,reason,detail});setReporting(false);notify("Report received. It will be available for review by Orbit’s administrators.");}}/>}
  {deleting&&selected&&<ViewModal title="Delete this listing?" onClose={()=>setDeleting(false)} busy={busy}><p>The listing will disappear from Marketplace. Existing private inquiries remain available to their participants.</p><div className="market-detail-actions"><button className="btn btn-secondary" disabled={busy} onClick={()=>setDeleting(false)}>Keep listing</button><button className="btn btn-primary" disabled={busy} onClick={()=>{void action(async()=>{await execute({type:"delete",id:selected.id});setDeleting(false);onSelect(null);setRetry(v=>v+1);notify("Listing deleted.");});}}>Delete listing</button></div></ViewModal>}
 </section>;
}

function MarketPhoto({ photo, alt }: { photo: Attachment; alt: string }) {
 const [failed,setFailed]=useState(false);
 return failed?<div className="market-photo-placeholder"><ImageIcon size={30}/><span>Photo unavailable</span></div>:<img src={marketPhotoUrl(photo)} alt={alt} loading="lazy" onError={()=>setFailed(true)}/>;
}
function MarketCard({ listing:l, busy,onOpen,onSave }: { listing:MarketListing;busy:boolean;onOpen:()=>void;onSave:()=>void }) {
 return <article className={`market-card panel${l.kind==="wanted"?" market-wanted":""}`}><button className="market-card-open" onClick={onOpen}><div className="market-card-image">{l.photos[0]?<MarketPhoto photo={l.photos[0]} alt={l.title}/>:<div className="market-photo-placeholder"><Search size={42}/><span>Looking for</span></div>}<span className="market-card-badge">{l.kind==="wanted"?l.status==="fulfilled"?"Fulfilled":"Wanted":l.status==="available"?l.category==="Free Stuff"?"Pass it on":"Campus find":l.status}</span></div><div className="market-card-copy"><strong className="market-price">{marketPrice(l.price,l.kind==="wanted")}</strong><h2>{l.title}</h2><span>{l.condition||l.category}</span><p><MapPin size={13}/>{l.area||"Arrange with requester"}</p>{l.availability&&<small>{l.availability}</small>}</div></button><button className="market-save icon-button" aria-label={`${l.saved?"Unsave":"Save"} ${l.title}`} aria-pressed={l.saved} disabled={busy} onClick={onSave}><Bookmark size={17} fill={l.saved?"currentColor":"none"}/></button></article>;
}
function MarketGallery({photos}:{photos:Attachment[]}) {
 const [index,setIndex]=useState(0);const photo=photos[Math.min(index,photos.length-1)];
 return <div className="market-gallery"><div className="market-main-photo">{photo?<a href={marketPhotoUrl(photo)} target="_blank" rel="noopener noreferrer"><MarketPhoto key={photo.id} photo={photo} alt={photo.name}/></a>:<div className="market-photo-placeholder"><Search size={52}/><span>Looking for a good find</span></div>}</div>{photos.length>1&&<div className="market-photo-thumbs">{photos.map((p,i)=><button key={p.id} aria-label={`View photo ${i+1}`} aria-pressed={index===i} onClick={()=>setIndex(i)}><MarketPhoto photo={p} alt={`Photo ${i+1}`}/></button>)}</div>}</div>;
}

function MarketForm({kind,listing,demo,onClose,onPublish}:{kind:"sale"|"wanted";listing?:MarketListing;demo:boolean;onClose:()=>void;onPublish:(input:ListingInput,photos:Attachment[])=>Promise<void>}) {
 const [id]=useState(()=>listing?.id||crypto.randomUUID());
 const [title,setTitle]=useState(listing?.title||"");const [description,setDescription]=useState(listing?.description||"");const [category,setCategory]=useState<MarketListing["category"]>(listing?.category||marketCategories[0]);
 const [price,setPrice]=useState(listing?.price===null?"":listing?String(listing.price!/100):"");const [free,setFree]=useState(listing?.price===0);
 const [condition,setCondition]=useState<MarketListing["condition"]>(listing?.condition||"Good");const [pickup,setPickup]=useState<MarketListing["pickup"]>(listing?.pickup||"On Campus");
 const [area,setArea]=useState(listing?.area||"");const [availability,setAvailability]=useState<MarketListing["availability"]>(listing?.availability||null);const [textbook,setTextbook]=useState(listing?.textbook||{course:"",isbn:"",edition:""});
 const [photos,setPhotos]=useState<Attachment[]>(listing?.photos||[]);const [rules,setRules]=useState(Boolean(listing));const [busy,setBusy]=useState(false);const [uploading,setUploading]=useState(false);const [error,setError]=useState("");
 async function submit(event:FormEvent) {
  event.preventDefault();if(busy||uploading)return;setBusy(true);setError("");
  try {
   const cents=kind==="sale"&&free?0:price.trim()===""?null:Math.round(Number(price)*100);
   const input=listingInputSchema.parse({id,kind,title,description,category,price:cents,condition:kind==="sale"?condition:null,pickup:kind==="sale"?pickup:null,area:kind==="sale"?area:"",availability:kind==="sale"?availability:null,textbook:category===marketCategories[0]?textbook:{course:"",isbn:"",edition:""},photoIds:photos.map(p=>p.id),status:listing?.status||(kind==="sale"?"available":"active"),rulesAccepted:rules});
   await onPublish(input,photos);
  } catch(cause) {setError(cause instanceof z.ZodError?cause.issues[0]?.message||"Check your listing.":actionError(cause));} finally {setBusy(false);}
 }
 return <ViewModal title={listing?"Edit your listing":kind==="wanted"?"What are you looking for?":"Pass something good along."} description={kind==="wanted"?"Let your campus know what you need.":"A few details, a few photos, and a new home for your item."} onClose={onClose} busy={busy||uploading}><form className="secondary-form market-form" onSubmit={event=>{void submit(event);}}>
  <fieldset disabled={busy||uploading}><legend className="sr-only">Listing details</legend>
   <label>Title<input required minLength={3} maxLength={100} value={title} onChange={e=>setTitle(e.target.value)} placeholder={kind==="wanted"?"Looking for a TI-84 calculator":"What are you passing along?"}/></label>
   <label>Category<OrbitSelect aria-label="Category" value={category} onChange={e=>{const next=e.target.value as MarketListing["category"];setCategory(next);if(next==="Free Stuff"){setFree(true);setPrice("0");}}}>{marketCategories.map(v=><option key={v}>{v}</option>)}</OrbitSelect></label>
   <label>Description<textarea required minLength={10} maxLength={3000} rows={4} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the item, its condition, and anything a student should know."/></label>
   <div className="market-form-row"><label>{kind==="wanted"?"Budget ($, optional)":"Price ($)"}<input type="number" required={kind==="sale"&&!free} min="0" max="1000000" step="0.01" disabled={kind==="sale"&&free} value={free&&kind==="sale"?"0":price} onChange={e=>setPrice(e.target.value)}/></label>{kind==="sale"&&<label className="market-check"><input type="checkbox" checked={free} disabled={category==="Free Stuff"} onChange={e=>setFree(e.target.checked)}/>Give it away for free</label>}</div>
   {category===marketCategories[0]&&<div className="market-textbook-fields"><p>Course details <span className="muted">· optional</span></p>{(["course","isbn","edition"] as const).map(key=><label key={key}>{key==="course"?"Course code":key==="isbn"?"ISBN":"Edition"}<input maxLength={key==="isbn"?24:40} value={textbook[key]} placeholder={key==="course"?"BIO 101":""} onChange={e=>setTextbook(v=>({...v,[key]:e.target.value}))}/></label>)}</div>}
   {kind==="sale"&&<><div className="market-form-row"><label>Condition<OrbitSelect aria-label="Condition" value={condition||"Good"} onChange={e=>setCondition(e.target.value as MarketListing["condition"])}>{marketConditions.map(v=><option key={v}>{v}</option>)}</OrbitSelect></label><label>Pickup preference<OrbitSelect aria-label="Pickup preference" value={pickup||"On Campus"} onChange={e=>setPickup(e.target.value as MarketListing["pickup"])}>{marketPickup.map(v=><option key={v}>{v}</option>)}</OrbitSelect></label></div><label>{pickup==="On Campus"?"Public campus meeting place":pickup==="Near Campus"?"General area or neighborhood":"Public meeting area (optional)"}<input required={pickup!=="Flexible"} maxLength={100} value={area} onChange={e=>setArea(e.target.value)} placeholder={pickup==="On Campus"?"Library entrance or student center":"A general area, never a home address"}/></label><label>Availability (optional)<OrbitSelect aria-label="Availability (optional)" value={availability||""} onChange={e=>setAvailability(e.target.value as MarketListing["availability"]||null)}><option value="">Arrange together</option>{marketAvailability.map(v=><option key={v}>{v}</option>)}</OrbitSelect></label></>}
  </fieldset>
  <div><p className="market-form-label">Photos {kind==="sale"?"· at least one required":"· optional"}</p><div className="market-cover-picker">{photos.map((p,i)=><button type="button" key={p.id} disabled={busy||uploading} aria-label={i===0?`Cover photo: ${p.name}`:`Make ${p.name} cover photo`} aria-pressed={i===0} onClick={()=>setPhotos(current=>[p,...current.filter(f=>f.id!==p.id)])}><MarketPhoto photo={p} alt={p.name}/><span>{i===0?<><Check size={12}/>Cover</>:"Make cover"}</span></button>)}</div><AttachmentPicker files={photos} onChange={setPhotos} demo={demo} disabled={busy} onBusy={setUploading} imagesOnly endpoint="/api/marketplace/photos" bucket={marketPhotoBucket} persistedIds={listing?.photos.map(p=>p.id)}/></div>
  <p className="market-safety">{marketRules}</p><label className="market-check"><input type="checkbox" required checked={rules} disabled={busy||uploading} onChange={e=>setRules(e.target.checked)}/>I’m posting an allowed item and will use public meeting locations.</label>
  {error&&<p className="form-error" role="alert">{error}</p>}<div className="market-detail-actions"><button type="button" className="btn btn-secondary" disabled={busy||uploading} onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy||uploading}>{busy?"Saving…":listing?"Save changes":kind==="wanted"?"Post request":"Publish listing"}<ArrowUpRight size={15}/></button></div>
 </form></ViewModal>;
}

export function MarketInbox({execute,read,profile,initialConversation,onListing,demoData}:{execute:Execute;read:Execute;profile:Profile;initialConversation:MarketConversation|null;onListing:(id:string)=>void;demoData:DemoMarket}) {
 const [conversations,setConversations]=useState<MarketConversation[]>([]);const [active,setActive]=useState(initialConversation?.id??null);const [hasMore,setHasMore]=useState(false);const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [retry,setRetry]=useState(0);
 const conversationPane=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(active)conversationPane.current?.scrollIntoView({block:"start",behavior:"smooth"});},[active]);
 useEffect(()=>{
  const controller=new AbortController();
  async function load(){try{const page=marketConversationsSchema.parse(await read({type:"conversations",offset:0},controller.signal));if(!controller.signal.aborted){setConversations(current=>[...page.conversations,...current.filter(c=>!page.conversations.some(n=>n.id===c.id))]);setHasMore(page.hasMore);setLoading(false);setError("");}}catch(cause){if(!controller.signal.aborted){setError(actionError(cause));setLoading(false);}}}
  void load();const timer=setInterval(()=>{if(document.visibilityState==="visible")void load();},15000);return()=>{controller.abort();clearInterval(timer);};
 },[read,retry,demoData]);
 // Keep the contact target separate so it cannot shift the inbox's page offsets.
 const selected=conversations.find(c=>c.id===active)??(initialConversation?.id===active?initialConversation:undefined);
 async function older(){setLoading(true);try{const page=marketConversationsSchema.parse(await read({type:"conversations",offset:conversations.length}));setConversations(current=>[...current,...page.conversations.filter(c=>!current.some(v=>v.id===c.id))]);setHasMore(page.hasMore);}catch(cause){setError(actionError(cause));}finally{setLoading(false);}}
 return <div className={`market-inbox${selected?" market-inbox-active":""}`}><aside className="panel market-inquiry-list"><h2>Your inquiries</h2><p className="muted">Private conversations about campus finds.</p>{conversations.map(c=><button className={active===c.id?"active":""} key={c.id} onClick={()=>setActive(c.id)}><MessageCircle size={17}/><span><strong>{c.title}</strong><small>{c.other.name}{c.removed?" · Listing removed":""}</small></span><ChevronRight size={15}/></button>)}{!loading&&!conversations.length&&<p className="market-state">Contact a seller or requester to start a private inquiry.</p>}{loading&&<p role="status">Loading inquiries…</p>}{hasMore&&<button className="text-button" disabled={loading} onClick={()=>{void older();}}>Load more inquiries</button>}</aside>{selected?<div ref={conversationPane} className="panel market-conversation"><button className="text-button market-mobile-inbox-back" onClick={()=>setActive(null)}><ArrowLeft size={15}/>All inquiries</button><div className="market-conversation-heading"><h2>Chat with {selected.other.name}</h2><button className="text-button" disabled={selected.removed} onClick={()=>onListing(selected.listingId)}>{selected.title}<ArrowUpRight size={14}/></button></div><MarketChat key={selected.id} conversation={selected} profile={profile} execute={execute} read={read}/></div>:<div className="panel market-state market-inquiry-placeholder"><MessageCircle size={35}/><h2>A quick question. A good find.</h2><p>Select an inquiry to read or send a message.</p></div>}{error&&<div role="alert" className="market-error"><p>{error}</p><button className="text-button" onClick={()=>setRetry(v=>v+1)}>Try again</button></div>}</div>;
}
function MarketChat({conversation,profile,execute,read}:{conversation:MarketConversation;profile:Profile;execute:Execute;read:Execute}) {
 const [messages,setMessages]=useState<MarketMessage[]>([]);const messagesRef=useRef(messages);messagesRef.current=messages;const [hasMore,setHasMore]=useState(false);const [body,setBody]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [retry,setRetry]=useState(0);const [loading,setLoading]=useState(true);
 const sendId=useRef<{id:string;body:string}|null>(null);
 const chatRef=useRef<HTMLDivElement>(null);const nearBottom=useRef(true);const historyScroll=useRef<{height:number;top:number}|null>(null);
 useLayoutEffect(()=>{const element=chatRef.current;if(!element)return;if(historyScroll.current){element.scrollTop=historyScroll.current.top+element.scrollHeight-historyScroll.current.height;historyScroll.current=null;}else if(nearBottom.current){element.scrollTop=element.scrollHeight;}},[messages]);
 useEffect(()=>{
  const controller=new AbortController();
  async function load(){try{const page=marketMessagesSchema.parse(await read({type:"messages",id:conversation.id,before:null},controller.signal));if(controller.signal.aborted)return;
   const old=messagesRef.current;const overlaps=!old.length||page.messages.some(m=>old.some(o=>o.id===m.id));
   setMessages(overlaps?[...old.filter(m=>!page.messages.some(n=>n.id===m.id)),...page.messages].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)):page.messages);
   setHasMore(current=>old.length>50&&overlaps?current:page.hasMore);setError("");setLoading(false);
  }catch(cause){if(!controller.signal.aborted){setError(actionError(cause));setLoading(false);}}}
  void load();const timer=setInterval(()=>{if(document.visibilityState==="visible")void load();},10000);return()=>{controller.abort();clearInterval(timer);};
 },[conversation.id,read,retry]);
 async function older(){setBusy(true);try{const page=marketMessagesSchema.parse(await read({type:"messages",id:conversation.id,before:messages[0]?.id||null}));if(chatRef.current)historyScroll.current={height:chatRef.current.scrollHeight,top:chatRef.current.scrollTop};setMessages(current=>[...page.messages,...current.filter(m=>!page.messages.some(n=>n.id===m.id))]);setHasMore(page.hasMore);}catch(cause){setError(actionError(cause));}finally{setBusy(false);}}
 async function send(event:FormEvent){event.preventDefault();if(!body.trim()||busy)return;setBusy(true);setError("");try{if(sendId.current?.body!==body.trim())sendId.current={id:crypto.randomUUID(),body:body.trim()};await execute({type:"send",id:conversation.id,messageId:sendId.current.id,body:sendId.current.body});setBody("");sendId.current=null;nearBottom.current=true;setRetry(v=>v+1);}catch(cause){setError(actionError(cause));}finally{setBusy(false);}}
 return <><p className="market-safety">Only you and {conversation.other.name} can read this inquiry. Keep pickup arrangements to public places.</p><div ref={chatRef} onScroll={()=>{const element=chatRef.current;if(element)nearBottom.current=element.scrollHeight-element.clientHeight-element.scrollTop<64;}} className="market-chat-messages" aria-label="Inquiry messages" aria-live="polite">{hasMore&&<button className="text-button" disabled={busy} onClick={()=>{void older();}}>Load older messages</button>}{loading&&<p role="status">Loading messages…</p>}{!loading&&!messages.length&&<p className="muted">Ask about availability, the item, or a public pickup spot.</p>}{messages.map(m=><article key={m.id} className={m.authorId===profile.id?"mine":""}><strong>{m.authorId===profile.id?"You":conversation.other.name}</strong><p>{m.body}</p><time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</time></article>)}</div>{error&&<p className="form-error" role="alert">{error}</p>}<form className="market-message-form" onSubmit={e=>{void send(e);}}><label className="sr-only" htmlFor="market-message">Message</label><textarea id="market-message" autoFocus required maxLength={2000} rows={2} placeholder={`Message ${conversation.other.name}…`} value={body} onChange={e=>setBody(e.target.value)} disabled={busy}/><button className="btn btn-primary" disabled={busy||!body.trim()}>{busy?"Sending…":"Send"}</button></form></>;
}
function ReportListing({onClose,onReport}:{onClose:()=>void;onReport:(reason:"Prohibited item"|"Suspected scam"|"Inappropriate content"|"Other",detail:string)=>Promise<void>}) {
 const [reason,setReason]=useState<"Prohibited item"|"Suspected scam"|"Inappropriate content"|"Other">("Suspected scam");const [detail,setDetail]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function send(event:FormEvent){event.preventDefault();setBusy(true);try{await onReport(reason,detail);}catch(cause){setError(actionError(cause));}finally{setBusy(false);}}
 return <ViewModal title="Report this listing" description="Reports are private and available to Orbit administrators." onClose={onClose} busy={busy}><form className="secondary-form market-form" onSubmit={e=>{void send(e);}}><label>Reason<OrbitSelect aria-label="Report reason" value={reason} disabled={busy} onChange={e=>setReason(e.target.value as typeof reason)}>{["Prohibited item","Suspected scam","Inappropriate content","Other"].map(v=><option key={v}>{v}</option>)}</OrbitSelect></label><label>Details (optional)<textarea maxLength={500} rows={3} value={detail} disabled={busy} onChange={e=>setDetail(e.target.value)}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy}>{busy?"Submitting…":"Submit report"}</button></form></ViewModal>;
}
