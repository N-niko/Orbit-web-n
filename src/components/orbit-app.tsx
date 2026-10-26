"use client";

import { threadFromPost, type Attachment, type PostResponse, type PostThread, type SocialPerson } from "@/lib/post-social";
import { ContentActionsProvider,type ContentTarget } from "./content-actions";
import { Feed } from "./home-feed";
import { ProfileConnections } from "./social-people";
import type { FollowEdge } from "@/lib/social";
import { AttachmentPicker, clearDemoFilePreviews } from "./post-attachments";
import { eventGoingCount,eventStatus,sortEvents } from "@/lib/events";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { sessionLoader } from "@/lib/session-load";
import { ArrowDown, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, ChevronRight, CircleHelp, Compass, Copy, GraduationCap, Heart, Home, LogOut, Menu, MessageCircle, Moon, Orbit, Plus, Search, Send, Settings2, ShoppingBag, Sparkles, Sun, Users, X } from "lucide-react";
import type { OrbitAction, OrbitData, Post, PostCategory } from "@/lib/types";
import { applyDemoAction, createDemoData } from "@/lib/demo";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { RoommatesView } from "./roommates";
import { EventsView } from "./events";
import { CampusView } from "./campus";
import { ProfileView } from "./profile";
import "./clubs.css";
import "./marketplace.css";
import { createDemoMarket } from "@/lib/marketplace-demo";
import { createDemoClubs } from "@/lib/clubs";
import { MemberAvatar, ViewModal } from "./secondary-shared";
import { AuthScreen } from "./auth-screen";
import { Onboarding } from "./onboarding";
import { OrbitSearch } from "./orbit-search";
import { DiscoveryPage, ProfileVisibilitySettings } from "./discovery-pages";
import { buildDirectory, defaultVisibility, withDirectoryPeople, type ProfileVisibility, type SearchTarget } from "@/lib/discovery";
import type { DirectoryProfile } from "@/lib/people-search";
import "@/app/design.css";

const ClubsView = dynamic(() => import("./clubs").then(module => module.ClubsView));
const MarketplaceView = dynamic(() => import("./marketplace").then(module => module.MarketplaceView));
function preloadView(view: string) {
  if (view === "clubs") void import("./clubs").catch(() => {});
  if (view === "marketplace") void import("./marketplace").catch(() => {});
}

type View = "home" | "roommates" | "events" | "campus" | "profile" | "clubs" | "marketplace";
const navigation = [{ id: "home", label: "Home feed", icon: Home }, { id: "marketplace", label: "Marketplace", icon: ShoppingBag }, { id: "roommates", label: "Roommates", icon: Users }, { id: "events", label: "Events & plans", icon: CalendarDays }, { id: "campus", label: "Campus hub", icon: Compass }, { id: "clubs", label: "Clubs", icon: MessageCircle }] as const;

async function getOnlineData(action?: OrbitAction): Promise<OrbitData> {
  const response = await fetch("/api/orbit", action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action), cache: "no-store" } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Your changes couldn’t be saved. Please try again.");
  return result;
}

export function OrbitApp({ initialMarketplace = false, initialListing = null }: { initialMarketplace?: boolean; initialListing?: string | null } = {}) {
  const [demo, setDemo] = useState(false);
  return <OrbitWorkspace initialMarketplace={initialMarketplace} initialListing={initialListing} key={demo ? "demo" : "account"} demo={demo} onDemo={() => setDemo(true)} onExitDemo={() => setDemo(false)} />;
}

function OrbitWorkspace({ demo, onDemo, onExitDemo, initialMarketplace, initialListing }: { demo: boolean; onDemo: () => void; onExitDemo: () => void; initialMarketplace: boolean; initialListing: string | null }) {
  useEffect(()=>{if(demo)return clearDemoFilePreviews;},[demo]);
  const [data, setData] = useState<OrbitData | null>(() => demo ? createDemoData() : null);
  const dataRef = useRef<OrbitData | null>(data);
  const [signedIn, setSignedIn] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [view, setView] = useState<View>(initialMarketplace ? "marketplace" : "home");
  const [activeClub, setActiveClub] = useState<string | null>(null);
  const [demoClubData, setDemoClubData] = useState(createDemoClubs);
  const [demoEdges, setDemoEdges] = useState<FollowEdge[]>([{followerId:"maya",followedId:"alex"},{followerId:"jordan",followedId:"alex"},{followerId:"alex",followedId:"sam"}]);
  const [demoMarket, setDemoMarket] = useState(createDemoMarket);
  const [marketId, setMarketId] = useState<string | null>(initialListing);
  const [marketCreate, setMarketCreate] = useState(false);
  const [detail, setDetail] = useState<SearchTarget | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<DirectoryProfile | null>(null);
  const [visibility, setVisibility] = useState<ProfileVisibility>(() => ({ ...defaultVisibility }));
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
    let authRevision = 0;
    const initialRevision = authRevision;
    const load = sessionLoader(async (userId: string | null) => {
      const signedIn = userId !== null;
      const current = ++generation.current;
      if (disposed) return;
      setSignedIn(signedIn); setSessionReady(true); setError("");
      if (!signedIn) { replaceData(null); setSelectedPerson(null); return; }
      replaceData(null);
      try { const next = await getOnlineData(); if (!disposed && current === generation.current) replaceData(next); }
      catch (cause) { if (!disposed && current === generation.current) setError(cause instanceof Error ? cause.message : "Unable to load your Orbit."); }
    });
    if (new URLSearchParams(window.location.search).get("recovery") === "1") { setRecovery(true); window.history.replaceState({}, "", "/"); }
    if (new URLSearchParams(window.location.search).has("authError")) { setToast("That sign-in link is invalid or expired. Please request a new link."); window.history.replaceState({}, "", "/"); }
    if (!client) { void load(null); return () => { disposed = true; }; }
    void client.auth.getSession().then(({ data, error }) => { if (error) throw error; if (!disposed && initialRevision === authRevision) void load(data.session?.user.id ?? null); }).catch(cause => { if (!disposed && initialRevision === authRevision) setError(cause instanceof Error ? cause.message : "Unable to load your session. Please try again."); });
    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { setRecovery(true); }
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        authRevision += 1;
        const revision = authRevision;
        window.setTimeout(() => { if (!disposed && revision === authRevision) void load(session?.user.id ?? null); }, 0);
      }
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

  const removeContent=useCallback(async (target:ContentTarget)=>{
    if(demo&&target.kind==="club_post"){
      const post=Object.values(demoClubData.posts).flat().find(p=>p.id===target.id);
      if(post&&post.author.id!==dataRef.current?.profile.id)throw new Error("Only the post author can delete it.");
      setDemoClubData(current=>({...current,posts:Object.fromEntries(Object.entries(current.posts).map(([club,posts])=>[club,posts.filter(p=>p.id!==target.id)]))}));
      return {};
    }
    if(demo&&target.kind==="event"){
      const event=dataRef.current?.events.find(e=>e.id===target.id);
      if(event?.clubId&&!demoClubData.clubs.some(c=>c.id===event.clubId&&c.createdBy===dataRef.current?.profile.id&&c.following))throw new Error("Only the club event owner can delete it.");
    }
    await onAction(target.kind==="event"?{type:"delete_event",id:target.id}:{type:"delete_post",id:target.id,club:target.kind==="club_post"});
    return {cleanupPending:Boolean(dataRef.current?.postFileCleanupPending)};
  },[demo,demoClubData,onAction]);

  async function respondDemoPost(id: string, action: PostResponse) {
    await onAction({ type: "respond_post", id, action });
    const current=dataRef.current;const post=current?.posts.find(post=>post.id===id);
    if(!current||!post)throw new Error("Post not found.");
    return threadFromPost(post,current.profile.id,current.workspace.members);
  }

  async function refreshOnline() {
    if(demo)return;
    const current=generation.current;mutationVersion.current+=1;
    await mutationQueue.current.catch(()=>{});
    const version=mutationVersion.current;
    const next=await getOnlineData();
    if(current===generation.current&&version===mutationVersion.current&&!pending.current)replaceData(next);
  }

  function navigate(next: View) { setView(next); setMarketId(null); setMarketCreate(false); setActiveClub(null); setDetail(null); setSelectedPerson(null); setMenu(false); setActivity(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openDetail(target: SearchTarget, person?: DirectoryProfile) { if (target.type === "club") { setActiveClub(target.id); setView("clubs"); setDetail(null); setMenu(false); setActivity(false); window.scrollTo({ top: 0, behavior: "smooth" }); return; } if (person) setSelectedPerson(person); setDetail(target); setMenu(false); setActivity(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openPerson(person: SocialPerson) { openDetail({ type: "person", id: person.id }, { id: person.id, name: person.name, color: person.color, university: person.university || dataRef.current?.profile.university || "", major: "", year: "", graduationYear: null }); }
  async function signOut() { const client = getSupabaseBrowserClient(); if (client) { const { error } = await client.auth.signOut(); if (error) notify(error.message); } }

  if (!demo && sessionReady && (!signedIn || recovery)) return <AuthScreen key={recovery ? "recovery" : "login"} recovery={recovery} notice={toast} onRecoveryDone={() => setRecovery(false)} onDemo={onDemo} />;

  if (!data) return <main className="loading-screen"><span className="logo-mark"><Orbit size={32} /></span><h1>Loading your Orbit…</h1>{error ? <><p className="form-error" role="alert">{error}</p><button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button><button className="text-button" onClick={signOut}>Sign out</button></> : <><p className="muted">Loading…</p><span className="loading-dots"><i /><i /><i /></span></>}</main>;

  if (!demo && !data.profile.onboardingCompletedAt) return <Onboarding profile={data.profile} onSaved={replaceData} onSignOut={signOut} />;

  const accountEvents = demo ? data.events.filter(event => !event.clubId || demoClubData.clubs.some(club => club.id === event.clubId && club.following)).map(event => event.clubId ? { ...event, clubName: demoClubData.clubs.find(club => club.id === event.clubId)?.name, canDelete:event.host===data.profile.id&&demoClubData.clubs.some(c=>c.id===event.clubId&&c.createdBy===data.profile.id&&c.following), clubColor:demoClubData.clubs.find(club=>club.id===event.clubId)?.color, hostName:data.workspace.members.find(p=>p.id===event.host)?.name } : {...event,canDelete:event.host===data.profile.id,followingHost:demoEdges.some(e=>e.followerId===data.profile.id&&e.followedId===event.host)}) : data.events;
  const screenData = { ...data, events: accountEvents };
  const firstName = data.profile.name.split(" ")[0];
  const profileVisibility = demo ? visibility : { ...defaultVisibility, ...data.profile.visibility };
  const localDirectory = buildDirectory(screenData, demo, profileVisibility,demoEdges);
  const directory = withDirectoryPeople({ ...localDirectory, clubs: demo ? demoClubData.clubs.map(club => ({ ...club, eventIds: [] })) : [] }, selectedPerson ? [selectedPerson] : []);
  const openTasks = data.tasks.filter(task => !task.completed && task.kind === "task");
  const upcoming = sortEvents(accountEvents.filter(event => !event.removed && eventStatus(event)!=="past"));

  return <ContentActionsProvider viewerId={data.profile.id} remove={removeContent} notify={notify}><div className="orbit-layout"><a className="skip-link" href="#main-content">Skip to content</a>
    {menu && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside className={`sidebar${menu ? " sidebar-open" : ""}`}>
      <button className="brand" onClick={() => navigate("home")} aria-label="Orbit home"><span className="logo-mark"><Orbit size={29} strokeWidth={1.6} /></span><span>orbit<span className="brand-dot">.</span></span></button>
      <div className="campus-label"><span className="campus-icon"><GraduationCap size={19} /></span><div><strong>Caldwell University</strong><span>Your campus community</span></div><span className="campus-online" /></div>
      <p className="nav-heading">Menu</p>
      <nav aria-label="Main navigation">{navigation.map(item => <button key={item.id} className={`nav-link${view === item.id ? " active" : ""}`} onMouseEnter={() => preloadView(item.id)} onFocus={() => preloadView(item.id)} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}><item.icon size={20} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "home" && <span className="nav-dot" />}{item.id === "events" && upcoming.length > 0 && <span className="nav-count">{upcoming.length}</span>}</button>)}</nav>
      <div className="nav-rule" /><p className="nav-heading">Account</p>
      <button className={`nav-link${view === "profile" ? " active" : ""}`} onClick={() => navigate("profile")}><Settings2 size={19} /><span>My profile</span></button>
      <button className="nav-link mobile-theme-control" onClick={() => setDark(!dark)}>{dark ? <Sun size={19} /> : <Moon size={19} />}<span>{dark ? "Light appearance" : "Dark appearance"}</span></button>
      <button className="nav-link" onClick={() => setHelp(true)}><CircleHelp size={19} /><span>Help</span></button>
      <div className="sidebar-bottom"><div className="connection-card"><span className="little-orbit"><Orbit size={42} strokeWidth={1} /><i /></span><h3>Good things happen<br />in good company.</h3><p>Bring your people into Orbit.</p><button className="text-button" onClick={() => navigate("roommates")}>Invite your roommates <ArrowUpRight size={15} /></button></div>
      <button className="user-card" onClick={() => navigate("profile")}><MemberAvatar profile={data.profile} /><span><strong>{data.profile.name}</strong><small>{data.profile.graduationYear ? `Class of ${data.profile.graduationYear}` : "Your profile"}</small></span><ChevronRight size={17} /></button></div>
    </aside>
    <div className="main-layout"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu size={21} /></button><span>Your space</span><ChevronRight size={14} /><strong>{detail ? detail.type === "person" ? "Student profile" : detail.type === "club" ? "Club preview" : "Event details" : view === "home" ? "Home feed" : view === "events" ? "Events & plans" : view === "campus" ? "Campus hub" : view === "profile" ? "My profile" : view === "clubs" ? "Clubs" : view === "marketplace" ? "Marketplace" : "Roommates"}</strong></div><div className="topbar-actions"><OrbitSearch directory={directory} onSelect={openDetail} demo={demo} /><button className="icon-button theme-button" onClick={() => setDark(!dark)} aria-label={dark ? "Use light appearance" : "Use dark appearance"}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button><div className="notification-wrap"><button className={`icon-button${activity ? " selected" : ""}`} aria-label="Your activity" aria-expanded={activity} onClick={() => setActivity(!activity)}><Bell size={20} /><i className="notification-dot" /></button>{activity && <div className="activity-popover"><h3>Activity</h3><p className="muted">{openTasks.length} open tasks · {upcoming.filter(e => e.attendees.includes(data.profile.id)).length} upcoming plans</p>{openTasks.slice(0, 3).map(task => <button key={task.id} onClick={() => navigate("roommates")}><span className="tiny-task-icon"><Check size={14} /></span><span>{task.title}<small>View task</small></span><ChevronRight size={15} /></button>)}{!openTasks.length && <p className="muted">No new activity.</p>}</div>}</div><span className="topbar-divider" /><button className="top-avatar-button" aria-label="Open your profile" onClick={() => navigate("profile")}><MemberAvatar profile={data.profile} small /></button></div></header>
    <div className="status-strip"><span><i className={`status-dot${demo ? " demo" : ""}`} />{demo ? "You’re exploring the demo" : saving ? "Saving your changes…" : "Connected to your shared space"}{demo && <span className="status-detail">Fictional people & activity · changes reset when you leave</span>}</span>{demo ? <button onClick={onExitDemo}>Back to log in <LogOut size={13} /></button> : <button onClick={signOut}>Sign out <LogOut size={13} /></button>}</div>
    {error && <div className="app-error" role="alert">{error}<button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
    <main id="main-content" className={`page-content page-${view}`}>
      {detail && <DiscoveryPage onPostChanged={()=>{void refreshOnline().catch(()=>{});}} respondDemo={respondDemoPost} onOpenPerson={openPerson} connectionsFor={person => <ProfileConnections onChanged={()=>{void refreshOnline().catch(()=>{});}} profile={person} viewerId={data.profile.id} demo={demo} demoEdges={demoEdges} onDemoChange={setDemoEdges} people={data.workspace.members} onOpenProfile={openPerson}/>} target={detail} directory={directory} data={screenData} demo={demo} onOpen={openDetail} onBack={() => setDetail(null)} onAction={onAction} onPrivacy={() => navigate("profile")} />}
      {!detail && <>
      {view === "home" && <div className="home-grid"><div className="home-primary"><div className="welcome-heading"><div><h1>Good to see you, {firstName}</h1><p className="muted">Here’s what’s happening on campus today.</p></div><span className="today-date">{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span></div>
      
      <div className="quick-stats"><button onClick={() => navigate("roommates")}><span className="stat-icon violet"><Check size={20} /></span><span><strong>{openTasks.length} open {openTasks.length === 1 ? "task" : "tasks"}</strong><small>Shared with your roommates</small></span><ArrowUpRight size={16} /></button><button onClick={() => navigate("events")}><span className="stat-icon peach"><CalendarDays size={19} /></span><span><strong>{upcoming.length} upcoming {upcoming.length === 1 ? "event" : "events"}</strong><small>On campus and from your clubs</small></span><ArrowUpRight size={16} /></button><button onClick={() => navigate("roommates")}><span className="stat-icon green"><Users size={20} /></span><span><strong>{data.workspace.members.length} {data.workspace.members.length === 1 ? "person" : "people"} in your space</strong><small>Your roommate group</small></span><ArrowUpRight size={16} /></button></div>
      <Feed edges={demoEdges} onOpenEvent={id=>openDetail({type:"event",id})} onOpenClub={id=>openDetail({type:"club",id})} onPostChanged={()=>{void refreshOnline().catch(()=>{});}} data={screenData} demo={demo} respondDemo={respondDemoPost} onAction={onAction} onOpenProfile={openPerson} />
      </div><aside className="right-rail"><section className="panel happening-panel"><div className="panel-title"><h2>Campus plans</h2><button className="text-button" onClick={()=>navigate("events")}>View all <ArrowUpRight size={14}/></button></div><div className="rail-empty"><CalendarDays size={28}/><p>{upcoming.length} upcoming & active plans in Events & plans.</p><p>Events from clubs you follow also appear in your feed.</p></div></section>
      <section className="panel todo-panel"><div className="panel-title"><h2>To-do</h2><span className="count-pill">{openTasks.length}</span></div><p className="muted">Chores and errands for your space.</p>{openTasks.slice(0, 3).map(task => <button className="rail-task" key={task.id} onClick={() => { void onAction({ type: "toggle_task", id: task.id }).catch(cause => notify(cause.message)); }}><span className="checkbox" /><span><strong>{task.title}</strong><small>{data.workspace.members.find(m => m.id === task.assignee)?.name.split(" ")[0] || "Your space"}{task.dueDate && ` · ${new Date(`${task.dueDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}</small></span></button>)}{!openTasks.length && <p className="rail-empty muted">Nothing left to do.</p>}<button className="rail-footer" onClick={() => navigate("roommates")}>Open shared space <ArrowRight size={14} /></button></section>
      <section className="campus-shortcut"><span className="campus-shortcut-icon"><GraduationCap size={23} /></span><h3>Campus hub</h3><p>Offices, resources and useful links in one place.</p><button className="text-button" onClick={() => navigate("campus")}>Explore Campus hub <ArrowUpRight size={15} /></button></section></aside></div>}
      {view === "roommates" && <RoommatesView data={data} onAction={onAction} />}
      {view === "events" && <EventsView onOpenClub={id=>openDetail({type:"club",id})} data={screenData} onAction={onAction} onOpenEvent={id => openDetail({ type: "event", id })} />}
      {view === "campus" && <CampusView />}
      {view === "marketplace" && <MarketplaceView profile={data.profile} demo={demo} demoData={demoMarket} onDemoChange={setDemoMarket} selectedId={marketId} onSelect={id => { setMarketId(id); window.scrollTo({ top: 0, behavior: "smooth" }); }} createRequested={marketCreate} onCreateHandled={() => setMarketCreate(false)} notify={notify} onProfile={listing => openDetail({ type: "person", id: listing.owner.id }, { ...listing.owner, university: listing.university, major: "", year: "", graduationYear: null })} />}
      {view === "clubs" && <ClubsView onOpenProfile={openPerson} people={data.workspace.members} events={accountEvents} onAction={onAction} onOpenEvent={id => openDetail({ type: "event", id })} onRefresh={refreshOnline} profile={data.profile} demo={demo} demoData={demoClubData} onDemoChange={setDemoClubData} selectedId={activeClub} onSelect={setActiveClub} />}
      {view === "profile" && <ProfileView onOpenPosts={()=>openDetail({type:"person",id:data.profile.id})} data={screenData} onAction={onAction} privacyPanel={<><ProfileConnections onChanged={()=>{void refreshOnline().catch(()=>{});}} profile={data.profile} viewerId={data.profile.id} demo={demo} demoEdges={demoEdges} onDemoChange={setDemoEdges} people={data.workspace.members} onOpenProfile={openPerson}/><ProfileVisibilitySettings demo={demo} value={profileVisibility} onChange={async (field, visible) => { if (demo) setVisibility(current => ({ ...current, [field]: visible })); else if (field === "major" || field === "year" || field === "bio" || field === "posts") await onAction({ type: "update_visibility", field, visible }); }} onPreview={() => openDetail({ type: "person", id: data.profile.id })} /></>} />}
      </>}
    </main></div>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    {help && <ViewModal title="How Orbit works" onClose={() => setHelp(false)}><div className="help-content"><div><Home /><p><strong>Feed & profile</strong>Home feed posts go to your shared space. Other signed-in students can read, like, and comment on your posts from your profile. The Posts switch in My profile controls all of them.</p></div><div><ShoppingBag /><p><strong>Marketplace</strong>Use a confirmed Caldwell email to buy, sell, or post Wanted requests. Save finds and contact sellers privately. Arrange pickup in a public place; Orbit does not process payments.</p></div><div><Users /><p><strong>Clubs</strong>Follow a club to share posts and files, like and comment, chat, and see its events. Club owners create club events.</p></div><div><CalendarDays /><p><strong>Events & plans</strong>Campus events are public; club events are for followers. Choose Going or Not going until an event ends. Remove hides a declined plan; restore it from Removed.</p></div><div><Check /><p><strong>Roommates</strong>Share an invite code to connect your space’s tasks and expenses. Expense tracking records spending; it does not send money.</p></div><p className="muted">{demo ? "The demo uses fictional data. Changes reset when you leave." : "Campus hub links to Caldwell services. Orbit is an independent student project."}</p></div></ViewModal>}
  </div></ContentActionsProvider>;
}

