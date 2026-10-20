"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, ChevronRight, CircleHelp, Compass, Copy, GraduationCap, Heart, Home, LogOut, Menu, MessageCircle, Moon, Orbit, Plus, Search, Send, Settings2, Sparkles, Sun, Users, X } from "lucide-react";
import type { OrbitAction, OrbitData, Post, PostCategory } from "@/lib/types";
import { applyDemoAction, createDemoData } from "@/lib/demo";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { RoommatesView } from "./roommates";
import { EventsView } from "./events";
import { CampusView } from "./campus";
import { ProfileView } from "./profile";
import { MemberAvatar, ViewModal } from "./secondary-shared";
import { AuthScreen } from "./auth-screen";
import { Onboarding } from "./onboarding";

type View = "home" | "roommates" | "events" | "campus" | "profile";
const navigation = [{ id: "home", label: "Home feed", icon: Home }, { id: "roommates", label: "Roommates", icon: Users }, { id: "events", label: "Events & plans", icon: CalendarDays }, { id: "campus", label: "Campus hub", icon: Compass }] as const;

async function getOnlineData(action?: OrbitAction): Promise<OrbitData> {
  const response = await fetch("/api/orbit", action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action), cache: "no-store" } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Your changes couldn’t be saved. Please try again.");
  return result;
}

export function OrbitApp() {
  const [demo, setDemo] = useState(false);
  return <OrbitWorkspace key={demo ? "demo" : "account"} demo={demo} onDemo={() => setDemo(true)} onExitDemo={() => setDemo(false)} />;
}

function OrbitWorkspace({ demo, onDemo, onExitDemo }: { demo: boolean; onDemo: () => void; onExitDemo: () => void }) {
  const [data, setData] = useState<OrbitData | null>(() => demo ? createDemoData() : null);
  const dataRef = useRef<OrbitData | null>(data);
  const [signedIn, setSignedIn] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [view, setView] = useState<View>("home");
  const [search, setSearch] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [menu, setMenu] = useState(false);
  const [activity, setActivity] = useState(false);
  const [help, setHelp] = useState(false);
  const [dark, setDark] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());
  const generation = useRef(0);
  const pending = useRef(false);
  const mutationVersion = useRef(0);

  const replaceData = useCallback((next: OrbitData | null) => { dataRef.current = next; setData(next); }, []);
  const notify = useCallback((message: string) => { setToast(message); }, []);

  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(""), 3200); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => { try { setDark(localStorage.getItem("orbit.theme") === "dark"); } catch { /* optional preference */ } }, []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; try { localStorage.setItem("orbit.theme", dark ? "dark" : "light"); } catch { /* optional preference */ } }, [dark]);

  useEffect(() => {
    // Demo mode never starts account requests, subscriptions, or live-data polling.
    if (demo) return;
    let disposed = false;
    const client = getSupabaseBrowserClient();
    async function load(signedIn: boolean) {
      const current = ++generation.current;
      if (disposed) return;
      setSignedIn(signedIn); setSessionReady(true); setError("");
      if (!signedIn) { replaceData(null); return; }
      replaceData(null);
      try { const next = await getOnlineData(); if (!disposed && current === generation.current) replaceData(next); }
      catch (cause) { if (!disposed && current === generation.current) setError(cause instanceof Error ? cause.message : "Unable to load your Orbit."); }
    }
    if (new URLSearchParams(window.location.search).get("recovery") === "1") { setRecovery(true); window.history.replaceState({}, "", "/"); }
    if (new URLSearchParams(window.location.search).has("authError")) { setToast("That sign-in link is invalid or expired. Please request a new link."); window.history.replaceState({}, "", "/"); }
    if (!client) { void load(false); return () => { disposed = true; }; }
    void client.auth.getSession().then(({ data, error }) => { if (error) throw error; if (!disposed) void load(Boolean(data.session)); }).catch(cause => { if (!disposed) setError(cause instanceof Error ? cause.message : "Unable to load your session. Please try again."); });
    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { setRecovery(true); }
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") window.setTimeout(() => { if (!disposed) void load(Boolean(session)); }, 0);
    });
    const poll = window.setInterval(() => { if (!disposed && dataRef.current && !pending.current && document.visibilityState === "visible") { const current = generation.current; const version = mutationVersion.current; void getOnlineData().then(next => { if (!disposed && current === generation.current && version === mutationVersion.current && !pending.current) replaceData(next); }).catch(() => {}); } }, 30000);
    return () => { disposed = true; subscription.subscription.unsubscribe(); clearInterval(poll); };
  }, [demo, replaceData]);

  const onAction = useCallback((action: OrbitAction): Promise<void> => {
    const currentGeneration = generation.current;
    const job = mutationQueue.current.catch(() => {}).then(async () => {
      if (!dataRef.current || currentGeneration !== generation.current) throw new Error("Your session changed. Please try again.");
      pending.current = true; mutationVersion.current += 1; setSaving(true);
      try {
        const next = demo ? applyDemoAction(dataRef.current, action) : await getOnlineData(action);
        if (currentGeneration !== generation.current) return;
        replaceData(next);
      } finally { pending.current = false; setSaving(false); }
    });
    mutationQueue.current = job;
    return job;
  }, [demo, replaceData]);

  function navigate(next: View) { setView(next); setSearch(""); setMenu(false); setActivity(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function signOut() { const client = getSupabaseBrowserClient(); if (client) { const { error } = await client.auth.signOut(); if (error) notify(error.message); } }

  if (!demo && sessionReady && (!signedIn || recovery)) return <AuthScreen key={recovery ? "recovery" : "login"} recovery={recovery} notice={toast} onRecoveryDone={() => setRecovery(false)} onDemo={onDemo} />;

  if (!data) return <main className="loading-screen"><span className="logo-mark"><Orbit size={32} /></span><h1>Getting your Orbit together.</h1>{error ? <><p className="form-error" role="alert">{error}</p><button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button><button className="text-button" onClick={signOut}>Sign out</button></> : <><p className="muted">A little connection is on its way.</p><span className="loading-dots"><i /><i /><i /></span></>}</main>;

  if (!demo && !data.profile.onboardingCompletedAt) return <Onboarding profile={data.profile} onSaved={replaceData} onSignOut={signOut} />;

  const firstName = data.profile.name.split(" ")[0];
  const openTasks = data.tasks.filter(task => !task.completed && task.kind === "task");
  const upcoming = data.events.filter(event => new Date(event.startsAt).getTime() >= Date.now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return <div className="orbit-layout"><a className="skip-link" href="#main-content">Skip to content</a>
    {menu && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside className={`sidebar${menu ? " sidebar-open" : ""}`}>
      <button className="brand" onClick={() => navigate("home")} aria-label="Orbit home"><span className="logo-mark"><Orbit size={29} strokeWidth={1.6} /></span><span>orbit<span className="brand-dot">.</span></span></button>
      <div className="campus-label"><span className="campus-icon"><GraduationCap size={19} /></span><div><strong>Caldwell University</strong><span>Your campus community</span></div><span className="campus-online" /></div>
      <p className="nav-heading">YOUR EVERYDAY ORBIT</p>
      <nav aria-label="Main navigation">{navigation.map(item => <button key={item.id} className={`nav-link${view === item.id ? " active" : ""}`} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}><item.icon size={20} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "home" && <span className="nav-dot" />}{item.id === "events" && upcoming.length > 0 && <span className="nav-count">{upcoming.length}</span>}</button>)}</nav>
      <div className="nav-rule" /><p className="nav-heading">MAKE IT YOURS</p>
      <button className={`nav-link${view === "profile" ? " active" : ""}`} onClick={() => navigate("profile")}><Settings2 size={19} /><span>My profile</span></button>
      <button className="nav-link mobile-theme-control" onClick={() => setDark(!dark)}>{dark ? <Sun size={19} /> : <Moon size={19} />}<span>{dark ? "Light appearance" : "Dark appearance"}</span></button>
      <button className="nav-link" onClick={() => setHelp(true)}><CircleHelp size={19} /><span>A little help</span></button>
      <div className="sidebar-bottom"><div className="connection-card"><span className="little-orbit"><Orbit size={42} strokeWidth={1} /><i /></span><h3>Good things happen<br />in good company.</h3><p>Bring your people into Orbit.</p><button className="text-button" onClick={() => navigate("roommates")}>Invite your roommates <ArrowUpRight size={15} /></button></div>
      <button className="user-card" onClick={() => navigate("profile")}><MemberAvatar profile={data.profile} /><span><strong>{data.profile.name}</strong><small>{data.profile.graduationYear ? `Class of ${data.profile.graduationYear}` : "Your profile"}</small></span><ChevronRight size={17} /></button></div>
    </aside>
    <div className="main-layout"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu size={21} /></button><span>Your space</span><ChevronRight size={14} /><strong>{view === "home" ? "Home feed" : view === "events" ? "Events & plans" : view === "campus" ? "Campus hub" : view === "profile" ? "My profile" : "Roommates"}</strong></div><div className="topbar-actions">{view !== "profile" && <label className="global-search"><Search size={17} /><input aria-label="Search current view" placeholder="Search your Orbit…" value={search} onChange={event => setSearch(event.target.value)} /></label>}<button className="icon-button theme-button" onClick={() => setDark(!dark)} aria-label={dark ? "Use light appearance" : "Use dark appearance"}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button><div className="notification-wrap"><button className={`icon-button${activity ? " selected" : ""}`} aria-label="Your activity" aria-expanded={activity} onClick={() => setActivity(!activity)}><Bell size={20} /><i className="notification-dot" /></button>{activity && <div className="activity-popover"><h3>In your Orbit</h3><p className="muted">{openTasks.length} open tasks · {upcoming.filter(e => e.attendees.includes(data.profile.id)).length} upcoming plans</p>{openTasks.slice(0, 3).map(task => <button key={task.id} onClick={() => navigate("roommates")}><span className="tiny-task-icon"><Check size={14} /></span><span>{task.title}<small>View in your shared space</small></span><ChevronRight size={15} /></button>)}{!openTasks.length && <p className="muted">You’re all caught up. Make a plan with your people.</p>}</div>}</div><span className="topbar-divider" /><button className="top-avatar-button" aria-label="Open your profile" onClick={() => navigate("profile")}><MemberAvatar profile={data.profile} small /></button></div></header>
    <div className="status-strip"><span><i className={`status-dot${demo ? " demo" : ""}`} />{demo ? "You’re exploring the demo" : saving ? "Saving your changes…" : "Connected to your shared space"}<span className="status-detail">{demo ? "Fictional people & activity · changes reset when you leave" : "Updates refresh every 30 seconds"}</span></span>{demo ? <button onClick={onExitDemo}>Back to log in <LogOut size={13} /></button> : <button onClick={signOut}>Sign out <LogOut size={13} /></button>}</div>
    {error && <div className="app-error" role="alert">{error}<button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
    <main id="main-content" className={`page-content page-${view}`}>
      {view === "home" && <div className="home-grid"><div className="home-primary"><div className="welcome-heading"><div><p className="eyebrow">A LITTLE CONNECTION GOES A LONG WAY</p><h1>Hey {firstName}, welcome home <span className="wave">✺</span></h1><p className="muted">Here’s what’s happening in your corner of campus.</p></div><span className="today-date">{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span></div>
      <section className="welcome-hero"><div className="hero-copy"><span className="hero-pill"><span />YOUR CAMPUS, A LITTLE CLOSER</span><h2>Your people.<br />Your plans.<br /><em>Your Orbit.</em></h2><p>Less scrolling. More showing up.<br />Make room for the moments that matter.</p><button className="btn hero-button" onClick={() => navigate("events")}>Find your next thing <ArrowUpRight size={16} /></button></div><CampusIllustration /></section>
      <div className="quick-stats"><button onClick={() => navigate("roommates")}><span className="stat-icon violet"><Check size={20} /></span><span><strong>{openTasks.length} things to do</strong><small>A little less on your mind</small></span><ArrowUpRight size={16} /></button><button onClick={() => navigate("events")}><span className="stat-icon peach"><CalendarDays size={19} /></span><span><strong>{upcoming.length} plans ahead</strong><small>Something to look forward to</small></span><ArrowUpRight size={16} /></button><button onClick={() => navigate("roommates")}><span className="stat-icon green"><Users size={20} /></span><span><strong>{data.workspace.members.length} in your space</strong><small>Better together, always</small></span><ArrowUpRight size={16} /></button></div>
      <Feed data={data} onAction={onAction} search={search} notify={notify} />
      </div><aside className="right-rail"><div className="rail-title"><span>THE CAMPUS PULSE</span><Sparkles size={15} /></div><section className="panel happening-panel"><div className="panel-title"><h2>Coming up</h2><button className="text-button" onClick={() => navigate("events")}>View all <ArrowUpRight size={14} /></button></div>{upcoming.slice(0, 3).map((event, i) => <button className="upcoming-event" key={event.id} onClick={() => navigate("events")}><span className={`event-thumb thumb-${i}`}><span className="thumb-orbit" />{i === 0 ? "✦" : i === 1 ? "✳" : "☕"}</span><span><small>{new Date(event.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {new Date(event.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</small><strong>{event.title}</strong><span className="event-location">{event.location}</span><span className="attendee-preview"><span className="mini-avatars">{data.workspace.members.filter(member => event.attendees.includes(member.id)).slice(0, 3).map(member => <MemberAvatar key={member.id} profile={member} small />)}</span>{event.attendees.length} going</span></span></button>)}{!upcoming.length && <div className="rail-empty"><CalendarDays size={28} /><p>A little room for a new plan.</p><button className="text-button" onClick={() => navigate("events")}>Create an event <Plus size={14} /></button></div>}</section>
      <section className="panel todo-panel"><div className="panel-title"><h2>A little to-do</h2><span className="count-pill">{openTasks.length}</span></div><p className="muted">Small things. Shared effort.</p>{openTasks.slice(0, 3).map(task => <button className="rail-task" key={task.id} onClick={() => { void onAction({ type: "toggle_task", id: task.id }).catch(cause => notify(cause.message)); }}><span className="checkbox" /><span><strong>{task.title}</strong><small>{data.workspace.members.find(m => m.id === task.assignee)?.name.split(" ")[0] || "Your space"}{task.dueDate && ` · ${new Date(`${task.dueDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}</small></span></button>)}{!openTasks.length && <p className="rail-empty muted">All clear. Enjoy a little downtime.</p>}<button className="rail-footer" onClick={() => navigate("roommates")}>Open shared space <ArrowRight size={14} /></button></section>
      <section className="campus-shortcut"><span className="campus-shortcut-icon"><GraduationCap size={23} /></span><h3>A whole campus<br />in your pocket.</h3><p>Resources, useful links, and the places you need.</p><button className="text-button" onClick={() => navigate("campus")}>Explore Campus hub <ArrowUpRight size={15} /></button><span className="shortcut-doodle">✳</span></section><footer className="rail-bottom"><span>Made for your everyday.</span><span>In your Orbit. In your element. <Orbit size={12} /></span></footer></aside></div>}
      {view === "roommates" && <RoommatesView data={data} onAction={onAction} search={search} />}
      {view === "events" && <EventsView data={data} onAction={onAction} search={search} />}
      {view === "campus" && <CampusView search={search} onClearSearch={() => setSearch("")} />}
      {view === "profile" && <ProfileView data={data} onAction={onAction} />}
    </main></div>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    {help && <ViewModal title="A little help goes a long way." onClose={() => setHelp(false)}><div className="help-content"><p>Orbit brings your campus life and shared home together.</p><div><Users /><p><strong>Start your shared space</strong>Head to Roommates, create a space, and share its invite code with friends who have an Orbit account.</p></div><div><CalendarDays /><p><strong>Make a plan</strong>Create an event and RSVP to the things you want to show up for. Plans are shared with your workspace.</p></div><div><GraduationCap /><p><strong>Find campus resources</strong>The Campus hub links directly to Caldwell University’s official services. Orbit is an independent student project.</p></div><p className="muted">{demo ? "This is a fictional sample community. Demo changes reset when you leave and never transfer to your real account." : "Your data is stored in your shared workspace. Expense tracking records shared spending; Orbit does not transfer money."}</p></div></ViewModal>}
  </div>;
}

function Feed({ data, onAction, search, notify }: { data: OrbitData; onAction: (action: OrbitAction) => Promise<void>; search: string; notify: (message: string) => void }) {
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<PostCategory>("general");
  const [filter, setFilter] = useState<"all" | PostCategory>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const posts = data.posts.filter(post => (filter === "all" || post.category === filter) && `${post.body} ${post.author.name}`.toLowerCase().includes(search.toLowerCase()));
  async function publish() { if (!body.trim()) return; setBusy(true); setError(""); try { await onAction({ type: "create_post", body: body.trim(), category }); setBody(""); notify("A little update, shared with your people."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to publish."); } finally { setBusy(false); } }
  return <section className="feed-section"><div className="feed-heading"><h2>In the loop <span>✳</span></h2><span>Your people, all caught up.</span></div><div className="composer panel"><div className="composer-input"><MemberAvatar profile={data.profile} /><textarea aria-label="Write a post" placeholder={`What’s on your mind, ${data.profile.name.split(" ")[0]}?`} value={body} onChange={event => setBody(event.target.value)} maxLength={3000} rows={body ? 3 : 1} /></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="composer-bottom"><div className="composer-types">{([{ value: "general", label: "Update", icon: Sparkles }, { value: "question", label: "Question", icon: MessageCircle }, { value: "marketplace", label: "Marketplace", icon: Copy }] as const).map(item => <button key={item.value} className={category === item.value ? "selected" : ""} onClick={() => setCategory(item.value)} aria-pressed={category === item.value}><item.icon size={15} /><span>{item.label}</span></button>)}</div><button className="btn btn-primary post-button" disabled={!body.trim() || busy} onClick={publish}>{busy ? "Posting…" : "Post"}<ArrowUpRight size={15} /></button></div></div><div className="feed-filters" aria-label="Filter posts">{([{ value: "all", label: "All posts" }, { value: "question", label: "Questions" }, { value: "marketplace", label: "Marketplace" }] as const).map(item => <button key={item.value} className={filter === item.value ? "active" : ""} onClick={() => setFilter(item.value)} aria-pressed={filter === item.value}>{item.label}</button>)}<span><ArrowDown size={13} />Latest first</span></div><div className="posts">{posts.map(post => <PostCard key={post.id} post={post} userId={data.profile.id} onAction={onAction} notify={notify} />)}{!posts.length && <div className="empty-state panel"><MessageCircle size={32} /><h3>{search ? "Nothing in this corner yet." : "Good conversations start somewhere."}</h3><p>{search ? "Try a different search or post category." : "Share an update, ask a question, or say a little hello."}</p></div>}</div></section>;
}

function PostCard({ post, userId, onAction, notify }: { post: Post; userId: string; onAction: (action: OrbitAction) => Promise<void>; notify: (message: string) => void }) {
  const [comments, setComments] = useState(false);
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState(false);
  const liked = post.likes.includes(userId);
  async function act(action: OrbitAction) { setPending(true); try { await onAction(action); return true; } catch (cause) { notify(cause instanceof Error ? cause.message : "Unable to save."); return false; } finally { setPending(false); } }
  async function copy() { try { await navigator.clipboard.writeText(`${post.author.name} on Orbit: ${post.body}`); notify("Post copied. Share a little connection."); } catch { notify("Copy is unavailable in this browser."); } }
  return <article className="post-card panel"><div className="post-heading"><MemberAvatar profile={post.author} /><div><strong>{post.author.name}</strong><span>{post.author.major || post.author.university} <i>·</i> {relativeTime(post.createdAt)}</span></div><span className={`post-category category-${post.category}`}>{post.category === "question" ? "A LITTLE HELP?" : post.category === "marketplace" ? "MARKETPLACE" : "CAMPUS LIFE"}</span></div><p className="post-body">{post.body}</p><div className="post-actions"><button className={liked ? "liked" : ""} onClick={() => act({ type: "toggle_like", id: post.id })} disabled={pending} aria-pressed={liked}><Heart size={18} fill={liked ? "currentColor" : "none"} />{post.likes.length > 0 && post.likes.length}<span>{liked ? "Liked" : "Like"}</span></button><button onClick={() => setComments(!comments)} aria-expanded={comments}><MessageCircle size={18} />{post.comments.length > 0 && post.comments.length}<span>{post.comments.length === 1 ? "Comment" : "Comments"}</span></button><button className="share-post" onClick={copy}><ArrowUpRight size={17} /><span>Share</span></button></div>{comments && <div className="comments-list">{post.comments.map(comment => <div className="comment" key={comment.id}><MemberAvatar profile={comment.author} small /><div><strong>{comment.author.name}<small>{relativeTime(comment.createdAt)}</small></strong><p>{comment.body}</p></div></div>)}<form className="comment-form" onSubmit={async event => { event.preventDefault(); if (reply.trim()) { if (await act({ type: "add_comment", id: post.id, body: reply.trim() })) setReply(""); } }}><input aria-label="Write a comment" value={reply} onChange={event => setReply(event.target.value)} placeholder="Add a little thought…" required maxLength={1000} /><button className="icon-button" aria-label="Send comment" disabled={!reply.trim() || pending}><Send size={17} /></button></form></div>}</article>;
}

function relativeTime(value: string) { const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)); if (minutes < 1) return "just now"; if (minutes < 60) return `${minutes}m ago`; if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`; return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

function CampusIllustration() { return <svg className="hero-illustration" viewBox="0 0 350 300" fill="none" aria-hidden="true"><ellipse cx="185" cy="163" rx="132" ry="88" transform="rotate(-32 185 163)" stroke="#b4a0e5" strokeWidth="1" strokeDasharray="5 6" /><circle cx="291" cy="94" r="7" fill="#a18acb" /><circle cx="83" cy="203" r="5" fill="#c0b0e3" /><path d="M269 224h51M294 199v50M282 212l26 26M308 212l-26 26" stroke="#a28bcf" strokeWidth="2" /><path d="M52 65h27M65.5 51.5v27" stroke="#9b83ca" strokeWidth="2"/><rect x="107" y="71" width="156" height="184" rx="14" transform="rotate(10 107 71)" fill="#c9b8e9"/><rect x="93" y="58" width="156" height="184" rx="14" transform="rotate(-8 93 58)" fill="#fbf8f2" stroke="#ded5eb"/><path d="M113 78l115-16" stroke="#ddd5e9"/><circle cx="113" cy="78" r="3" fill="#b5a5d0"/><circle cx="123" cy="77" r="3" fill="#b5a5d0"/><circle cx="133" cy="76" r="3" fill="#b5a5d0"/><path d="M131 118q14-31 42-19q20 8 13 29l-17 11-30-2-8-19Z" fill="#4c416b"/><ellipse cx="160" cy="126" rx="20" ry="25" transform="rotate(-8 160 126)" fill="#eab596"/><path d="M139 118q25 1 28-19q18 12 15 26" fill="#4c416b"/><path d="M158 149l-4 17 22 2-6-21" fill="#eab596"/><path d="M125 175q10-24 31-17q12 11 21-3q26-3 38 29l-4 26-92 13 6-48Z" fill="#8573b5"/><path d="M129 185l-7 22 75-11" stroke="#e9b294" strokeWidth="14" strokeLinecap="round"/><path d="M177 173l35-5 13 30-36 5-12-30Z" fill="#c7d9c5"/><path d="M185 178l21-3M190 186l15-2" stroke="#7e967b" strokeWidth="2"/><rect x="202" y="39" width="99" height="64" rx="12" transform="rotate(8 202 39)" fill="white" stroke="#e6dff0"/><rect x="216" y="54" width="28" height="28" rx="8" transform="rotate(8 216 54)" fill="#eae2f8"/><path d="M222 61l14 2M224 59l-2 15 15 2 2-15M221 66l17 2" stroke="#8c74b2" strokeWidth="1.6"/><path d="M254 63l30 4M253 73l20 3" stroke="#b5a9c6" strokeWidth="4" strokeLinecap="round"/><rect x="42" y="217" width="139" height="48" rx="24" transform="rotate(-8 42 217)" fill="white" stroke="#e6dff0"/><circle cx="67" cy="239" r="13" fill="#d2dec9"/><path d="M62 239l4 4 8-10" stroke="#6c8263" strokeWidth="2" strokeLinecap="round"/><path d="M92 231l64-9M93 241l44-6" stroke="#b3a4c8" strokeWidth="4" strokeLinecap="round"/><path d="M282 151l3 8 9 1-7 6 2 9-8-5-8 4 2-9-6-6 9-1 4-7Z" fill="#f4cc92"/></svg>; }
