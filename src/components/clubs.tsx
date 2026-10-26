"use client";

import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ArrowLeft, ArrowUpRight, Check, Compass, LockKeyhole, MapPin, MessageCircle, Plus, Search, Send, Users } from "lucide-react";
import { sortEvents } from "@/lib/events";
import type { CampusEvent, OrbitAction, Profile } from "@/lib/types";
import { clubCategories, clubColors, clubListSchema, clubMessagesSchema, clubSchema, createClubSchema, filterClubs, mergeClubMessages, setDemoFollow, type Club, type ClubMessage, type DemoClubs } from "@/lib/clubs";
import type { SocialPerson } from "@/lib/post-social";
import { ClubPosts } from "./club-posts";
import { CreateEventDialog, EventCard } from "./events";
import { MemberAvatar, ViewModal } from "./secondary-shared";
import "./secondary.css";
import "./clubs.css";

class ClubRequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function clubRequest(path: string, options?: RequestInit) {
  const response = await fetch(path, { ...options, cache: "no-store" });
  const result = await response.json().catch(() => ({ error: "Clubs could not load. Please try again." }));
  if (!response.ok) throw new ClubRequestError(result.error || "Clubs could not load. Please try again.", response.status);
  return result;
}
const jsonPost = (value: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

export function ClubsView({ profile, demo, demoData, onDemoChange, selectedId, onSelect, events, onAction, onOpenEvent, onRefresh, onOpenProfile, people }: {
  onOpenProfile:(person:SocialPerson)=>void; people:SocialPerson[];
  profile: Profile; demo: boolean; demoData: DemoClubs; onDemoChange: Dispatch<SetStateAction<DemoClubs>>;
  selectedId: string | null; onSelect: (id: string | null) => void;
  events: CampusEvent[]; onAction: (action: OrbitAction) => Promise<void>; onOpenEvent: (id: string) => void; onRefresh: () => Promise<void>;
}) {
  const [activity, setActivity] = useState<"posts" | "chat" | "events">("posts");
  const [eventCreate, setEventCreate] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [tab, setTab] = useState<"discover" | "following">("following");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Club | null>(null);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (selectedId) return;
    const controller = new AbortController();
    if (demo) { setClubs(filterClubs(demoData.clubs, query, category, tab === "following")); setLoading(false); setError(""); return; }
    setLoading(true); setError("");
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim(), category, following: String(tab === "following") });
        const result = clubListSchema.parse(await clubRequest(`/api/clubs?${params}`, { signal: controller.signal }));
        if (!controller.signal.aborted) { setClubs(result.clubs); setLoading(false); }
      } catch (cause) { if (!controller.signal.aborted) { setError(message(cause)); setLoading(false); } }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, category, tab, demo, demoData, retry, selectedId]);

  useEffect(() => {
    setSelected(null); setDetailError(""); setActivity("posts"); setEventCreate(false);
    if (!selectedId) return;
    if (demo) { setSelected(demoData.clubs.find(club => club.id === selectedId) ?? null); return; }
    const controller = new AbortController();
    void clubRequest(`/api/clubs/${selectedId}`, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setSelected(clubSchema.parse(result));
    }).catch(cause => { if (!controller.signal.aborted) setDetailError(message(cause)); });
    return () => controller.abort();
  }, [selectedId, demo, demoData.clubs, retry]);

  useEffect(() => { if (selected) document.getElementById("club-heading")?.focus(); }, [selected?.id]);

  async function follow(club: Club) {
    setBusy(true); setDetailError("");
    try {
      if (demo) onDemoChange(current => setDemoFollow(current, club.id, !club.following));
      else {
        const next = clubSchema.parse(await clubRequest(`/api/clubs/${club.id}/follow`, jsonPost({ following: !club.following })));
        setSelected(current => current?.id === next.id ? next : current);
        setClubs(current => current.map(item => item.id === next.id ? next : item));
        await onRefresh();
      }
    } catch (cause) { setDetailError(message(cause)); }
    finally { setBusy(false); }
  }

  async function membershipLost() {
    if (!selectedId || demo) return;
    try { setSelected(clubSchema.parse(await clubRequest(`/api/clubs/${selectedId}`))); }
    catch { setSelected(current => current ? { ...current, following: false } : current); }
    void onRefresh().catch(() => {});
    setDetailError("You’re no longer following this club. Follow it to open its posts, chat, and events again.");
  }

  return <div className="secondary-view clubs-view">
    {selectedId ? <>
      <button type="button" className="discovery-back" onClick={() => onSelect(null)}><ArrowLeft size={16} />Back to clubs</button>
      {selected ? <>
        <section className={`panel club-detail-banner club-tone-${selected.color}`}><span className="club-banner-symbol" aria-hidden="true">✳</span><span className="club-category">{selected.category}</span><h1 id="club-heading" tabIndex={-1}>{selected.name}</h1><p>{selected.description}</p><div className="club-detail-actions"><span><Users size={16} />{selected.followerCount} {selected.followerCount === 1 ? "follower" : "followers"}</span><button type="button" disabled={busy} className={`btn ${selected.following ? "btn-secondary" : "btn-primary"}`} onClick={() => { void follow(selected); }}>{busy ? "Saving…" : selected.following ? <><Check size={16} />Following · unfollow</> : <><Plus size={16} />Follow club</>}</button></div></section>
        {detailError && <p className="secondary-error" role="alert">{detailError}</p>}
        <div className="club-detail-grid"><aside className="panel club-about"><span className="club-section-eyebrow">A PLACE TO CONNECT</span><h2>Get together.</h2><p><MapPin size={18} />{selected.meeting || "Meeting details haven’t been added yet."}</p><div className="club-about-note"><MessageCircle size={20} /><strong>Your people, one conversation away.</strong><p>Follow this club to read and share posts, chat with the group, and keep up with its events.</p></div></aside>
          {selected.following ? <div className="club-activity">
            <div className="club-tabs club-activity-tabs" aria-label="Club activity">{(["posts", "chat", "events"] as const).map(item => <button type="button" key={item} aria-pressed={activity === item} onClick={() => setActivity(item)}>{item === "posts" ? "Posts" : item === "chat" ? "Chat" : "Events"}</button>)}</div>
            {activity === "posts" ? <ClubPosts onOpenProfile={onOpenProfile} people={people} onRefresh={onRefresh} key={selected.id} club={selected} profile={profile} demo={demo} demoData={demoData} onDemoChange={onDemoChange} onMembershipLost={membershipLost} /> : activity === "chat" ? <ClubStream key={selected.id} club={selected} profile={profile} demo={demo} demoMessages={demoData.messages[selected.id] ?? []} onDemoChange={onDemoChange} onMembershipLost={membershipLost} /> :
              <section className="club-events"><div className="club-events-heading"><div><h2>Club plans</h2><p className="muted">Also in your Events & plans.</p></div>{selected.createdBy === profile.id && <button className="btn btn-primary" onClick={() => setEventCreate(true)}><Plus size={16} />Create club event</button>}</div>
                {sortEvents(events.filter(event => event.clubId === selected.id)).map(event => <EventCard key={event.id} event={event} userId={profile.id} onAction={onAction} onOpenEvent={onOpenEvent} onOpenClub={onSelect} />)}
                {!events.some(event => event.clubId === selected.id) && <div className="panel empty-state"><h3>No club plans yet.</h3><p>{selected.createdBy === profile.id ? "Create the first event for your followers." : "The club owner can share an event here."}</p></div>}
              </section>}
          </div> : <section className="panel club-chat-locked"><span><LockKeyhole size={28} /></span><h2>Your club, a little closer.</h2><p>Follow {selected.name} to read and share posts, open the chat, and see club events.</p><button type="button" className="btn btn-primary" disabled={busy} onClick={() => { void follow(selected); }}><Plus size={16} />Follow to join in</button></section>}
          {eventCreate && selected.following && selected.createdBy === profile.id && <CreateEventDialog club={selected} onAction={onAction} onClose={() => setEventCreate(false)} />}
        </div>
      </> : detailError ? <section className="panel empty-state"><h2>We couldn’t open this club.</h2><p role="alert">{detailError}</p><button className="btn btn-secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></section> : <p className="muted" role="status">Opening your club…</p>}
    </> : <>
      <div className="view-heading"><div><p className="eyebrow">FIND YOUR KIND OF PEOPLE</p><h1>A little interest. A whole new Orbit.</h1><p className="muted">Find a club, follow along, and start a conversation.</p></div><button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={17} />Create a club</button></div>
      <section className="panel clubs-intro"><span className="clubs-intro-art" aria-hidden="true"><Users size={45} /><i>✳</i></span><div><span className="club-section-eyebrow">GOOD COMPANY STARTS WITH A HELLO</span><h2>There’s a corner of campus for you.</h2><p>Big interests, small ideas, and people who get it. Explore what brings you together.</p></div></section>
      <div className="club-directory-tools"><div className="club-tabs" aria-label="Club directory"><button type="button" aria-pressed={tab === "following"} onClick={() => setTab("following")}><Check size={16} />My clubs</button><button type="button" aria-pressed={tab === "discover"} onClick={() => setTab("discover")}><Compass size={16} />Discover clubs</button></div><div className="club-filters"><label className="club-search"><Search size={17} /><input aria-label="Search clubs" value={query} maxLength={100} placeholder="Find your next interest…" onChange={event => setQuery(event.target.value)} /></label><label className="club-category-filter"><span className="sr-only">Club category</span><select aria-label="Club category" value={category} onChange={event => setCategory(event.target.value)}><option value="">All interests</option>{clubCategories.map(item => <option key={item}>{item}</option>)}</select></label></div></div>
      {error && <div className="club-load-error" role="alert"><p>{error}</p><button className="btn btn-secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
      {loading ? <p className="muted" role="status">Finding your clubs…</p> : !error && <>
        <p className="club-results-count" role="status">{clubs.length} {clubs.length === 1 ? "club" : "clubs"}{clubs.length === 100 ? " · Refine your search to find more" : ""}</p>
        {clubs.length ? <div className="club-cards">{clubs.map(club => <button type="button" key={club.id} className="panel club-card" onClick={() => onSelect(club.id)}><span className={`club-card-art club-tone-${club.color}`}><Users size={32} /><i aria-hidden="true">✳</i>{club.following && <span><Check size={12} />Following</span>}</span><span className="club-card-body"><span className="club-category">{club.category}</span><strong>{club.name}</strong><span className="club-card-description">{club.description}</span><span className="club-card-footer"><span><Users size={14} />{club.followerCount} {club.followerCount === 1 ? "follower" : "followers"}</span><span>View club <ArrowUpRight size={16} /></span></span></span></button>)}</div> : <section className="panel club-directory-empty"><Users size={33} /><h2>{query || category ? "No clubs match just yet." : tab === "following" ? "Your next connection is waiting." : "Make room for a new interest."}</h2><p>{query || category ? "Try another name or interest." : tab === "following" ? "Explore the directory and follow a club to find it here." : "Start the first club and give your people a place to connect."}</p><button type="button" className="btn btn-secondary" onClick={() => tab === "following" ? setTab("discover") : setCreating(true)}>{tab === "following" ? "Discover clubs" : "Create a club"}</button></section>}
      </>}
    </>}
    {creating && <CreateClubModal profile={profile} demo={demo} onDemoChange={onDemoChange} onClose={() => setCreating(false)} onCreated={club => { setCreating(false); onSelect(club.id); }} />}
  </div>;
}

function CreateClubModal({ profile, demo, onDemoChange, onClose, onCreated }: { profile: Profile; demo: boolean; onDemoChange: Dispatch<SetStateAction<DemoClubs>>; onClose: () => void; onCreated: (club: Club) => void }) {
  const [id] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setError("");
    const parsed = createClubSchema.safeParse({ id, name: form.get("name"), description: form.get("description"), category: form.get("category"), meeting: form.get("meeting"), color: form.get("color") });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your club details."); return; }
    setBusy(true);
    try {
      const club: Club = demo ? { ...parsed.data, following: true, followerCount: 1, createdBy: profile.id, createdAt: new Date().toISOString() }
        : clubSchema.parse(await clubRequest("/api/clubs", jsonPost(parsed.data)));
      if (demo) onDemoChange(current => ({ ...current, clubs: [...current.clubs, club], posts: { ...current.posts, [club.id]: [] }, messages: { ...current.messages, [club.id]: [] } }));
      onCreated(club);
    } catch (cause) { setError(message(cause)); setBusy(false); }
  }
  return <ViewModal title="Start a little something." description="Create a club and give people a place to connect." onClose={onClose} busy={busy}><form className="secondary-form" onSubmit={create}><fieldset disabled={busy} className="club-create-fields"><label className="field">Club name<input name="name" autoFocus required minLength={2} maxLength={80} placeholder="What brings your people together?" /></label><label className="field">About your club<textarea name="description" required maxLength={2000} rows={4} placeholder="What will you do, and who would enjoy joining?" /></label><label className="field">Interest<select name="category" defaultValue="Other">{clubCategories.map(category => <option key={category}>{category}</option>)}</select></label><label className="field">Meeting details <small>Optional</small><input name="meeting" maxLength={240} placeholder="e.g. Tuesdays at 5 · Student Center" /></label><fieldset className="club-color-picker"><legend>A little color</legend>{clubColors.map((color, index) => <label key={color} className={`club-tone-${color}`}><input type="radio" name="color" value={color} defaultChecked={index === 0} /><span>{["Lavender", "Peach", "Sage", "Blue"][index]}</span></label>)}</fieldset></fieldset>{error && <p className="secondary-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create club"}</button></div></form></ViewModal>;
}

function ClubStream({ club, profile, demo, demoMessages, onDemoChange, onMembershipLost }: { club: Club; profile: Profile; demo: boolean; demoMessages: ClubMessage[]; onDemoChange: Dispatch<SetStateAction<DemoClubs>>; onMembershipLost: () => void }) {
  const stream = "messages";
  const limit = 2000;
  const [chat, setChat] = useState<{ messages: ClubMessage[]; hasMore: boolean; ready: boolean }>({ messages: [], hasMore: false, ready: false });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const requestId = useRef<{ id: string; body: string } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const scroll = useRef<{ bottom?: boolean; oldHeight?: number }>({ bottom: true });
  const lost = useRef(onMembershipLost); lost.current = onMembershipLost;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (demo) { setChat({ messages: demoMessages, hasMore: false, ready: true }); return; }
    const controller = new AbortController(); let busy = false;
    async function refresh() {
      if (busy || controller.signal.aborted) return; busy = true;
      try {
        const result = clubMessagesSchema.parse(await clubRequest(`/api/clubs/${club.id}/${stream}`, { signal: controller.signal }));
        if (controller.signal.aborted) return;
        const node = list.current;
        scroll.current = { bottom: !node || node.scrollHeight - node.scrollTop - node.clientHeight < 90 };
        setChat(current => {
          const gap = result.messages.length === 50 && current.messages.length > 0 && !result.messages.some(next => current.messages.some(previous => previous.id === next.id));
          return !current.ready || gap ? { ...result, ready: true } : { ...current, messages: mergeClubMessages(current.messages, result.messages) };
        }); setLoadError("");
      } catch (cause) {
        if (!controller.signal.aborted) {
          if (cause instanceof ClubRequestError && cause.status === 403) { setChat({ messages: [], hasMore: false, ready: true }); lost.current(); }
          else { setLoadError(message(cause)); setChat(current => ({ ...current, ready: true })); }
        }
      } finally { busy = false; }
    }
    void refresh();
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 4000);
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", focus);
    return () => { controller.abort(); clearInterval(poll); document.removeEventListener("visibilitychange", focus); };
  }, [club.id, demo, demoMessages, retry, stream]);

  useLayoutEffect(() => {
    const node = list.current; if (!node) return;
    if (scroll.current.oldHeight !== undefined) node.scrollTop += node.scrollHeight - scroll.current.oldHeight;
    else if (scroll.current.bottom) node.scrollTop = node.scrollHeight;
    scroll.current = {};
  }, [chat.messages]);

  async function older() {
    if (!chat.messages.length) return; setLoadingOlder(true); setLoadError("");
    try {
      const result = clubMessagesSchema.parse(await clubRequest(`/api/clubs/${club.id}/${stream}?before=${encodeURIComponent(chat.messages[0].id)}`));
      if (!mounted.current) return;
      scroll.current = { oldHeight: list.current?.scrollHeight };
      setChat(current => ({ messages: mergeClubMessages(current.messages, result.messages), hasMore: result.hasMore, ready: true }));
    } catch (cause) { if (mounted.current) { if (cause instanceof ClubRequestError && cause.status === 403) { setChat({ messages: [], hasMore: false, ready: true }); lost.current(); } else setLoadError(message(cause)); } }
    finally { if (mounted.current) setLoadingOlder(false); }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const body = draft.trim(); if (!body || sending) return;
    if (!requestId.current || requestId.current.body !== body) requestId.current = { id: crypto.randomUUID(), body };
    const payload = requestId.current; setSending(true); setError("");
    try {
      if (!demo) await clubRequest(`/api/clubs/${club.id}/${stream}`, jsonPost(payload));
      if (!mounted.current) return;
      const sent = { ...payload, createdAt: new Date().toISOString(), author: { id: profile.id, name: profile.name, color: profile.color } };
      scroll.current = { bottom: true };
      if (demo) onDemoChange(current => ({ ...current, [stream]: { ...current[stream], [club.id]: mergeClubMessages(current[stream][club.id] ?? [], [sent]) } }));
      else setChat(current => ({ ...current, messages: mergeClubMessages(current.messages, [sent]) }));
      setDraft(""); requestId.current = null;
    } catch (cause) {
      if (mounted.current) {
        if (cause instanceof ClubRequestError && cause.status === 403) { setChat({ messages: [], hasMore: false, ready: true }); lost.current(); }
        else setError(message(cause));
      }
    } finally { if (mounted.current) setSending(false); }
  }

  return <section className={"panel club-chat"}><div className="club-chat-heading"><span><MessageCircle size={19} /><strong>Club chat</strong></span><small>For followers</small></div><div ref={list} className="club-messages" role="log" aria-label={`${club.name} ${stream}`} aria-live="polite" aria-relevant="additions">
    {chat.hasMore && <button type="button" className="club-older" disabled={loadingOlder} onClick={() => { void older(); }}>{loadingOlder ? "Loading…" : `Load earlier ${stream}`}</button>}
    {!chat.ready ? <p className="muted" role="status">Loading club activity…</p> : !chat.messages.length && !loadError ? <div className="club-chat-empty"><MessageCircle size={28} /><h3>Say the first hello.</h3><p>Introduce yourself or share an idea for the club.</p></div> : chat.messages.map(item => <article key={item.id} className={`club-message${item.author.id === profile.id ? " club-message-own" : ""}`}><MemberAvatar small profile={{ ...item.author, university: "", major: "", year: "", bio: "" }} /><div><header><strong>{item.author.name}</strong><time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>{new Date(item.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></header><p>{item.body}</p></div></article>)}
    </div>{loadError && <div className="club-chat-error" role="alert"><p>{loadError}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}{error && <div className="club-chat-error" role="alert"><p>{error}</p><p>Your draft is kept. Try again when you’re ready.</p></div>}
    <form className="club-composer" onSubmit={send}><label className="sr-only" htmlFor={`club-message-${club.id}`}>Message {club.name}</label><textarea id={`club-message-${club.id}`} aria-label={`$Message ${club.name}`} placeholder="A little hello goes a long way…" rows={2} maxLength={limit} value={draft} disabled={sending} onChange={event => setDraft(event.target.value)} /><div><small>{draft.length}/{limit}</small><button type="submit" className="btn btn-primary" disabled={sending || !draft.trim() || !chat.ready}><Send size={15} />{sending ? "Sending…" : "Send"}</button></div></form>
  </section>;
}
