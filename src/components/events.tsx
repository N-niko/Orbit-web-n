"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, CalendarDays, Check, Clock3, MapPin, Plus, Sparkles, Users } from "lucide-react";
import type { CampusEvent } from "@/lib/types";
import { eventGoingCount, eventResponse } from "@/lib/events";
import { EventResponseControls } from "./event-controls";
import type { OrbitAction } from "@/lib/types";
import { ActionError, actionError, ViewModal, type ViewProps } from "./secondary-shared";
import "./secondary.css";

const categories = ["All events", "Social", "Academic", "Clubs", "Wellness"] as const;
const coverOptions = ["violet", "peach", "green", "blue"];

export function EventArtwork({ cover, category, title, compact = false }: { cover: string; category: string; title?: string; compact?: boolean }) {
  const theme = coverOptions.includes(cover) ? cover : "violet";
  return <div className={`event-art event-art-${theme}${compact ? " event-art-compact" : ""}`} aria-hidden="true">
    <span className="event-art-orbit event-art-orbit-one" /><span className="event-art-orbit event-art-orbit-two" /><span className="event-art-star">✦</span><span className="event-art-small-star">✳</span>
    <div className="event-art-label"><span>{category === "Academic" ? "GOOD IDEAS. GREAT COMPANY." : category === "Wellness" ? "A LITTLE ROOM TO RESET." : category === "Clubs" ? "FIND YOUR KIND OF PEOPLE." : "MAKE TIME FOR A GOOD TIME."}</span><strong>{title || (category === "Academic" ? "Better\ntogether." : category === "Wellness" ? "Breathe\nit all in." : category === "Clubs" ? "Find your\npeople." : "See you\nthere.")}</strong></div>
  </div>;
}

export function EventsView({ data, onAction, search = "", onOpenEvent }: ViewProps & { onOpenEvent?: (id: string) => void }) {
  const [category, setCategory] = useState<string>("All events");
  const [tab, setTab] = useState<"all" | "going" | "removed">("all");
  const [showCreate, setShowCreate] = useState(false);
  const events = data.events.filter(event => (tab === "removed" ? event.removed : !event.removed)
    && (tab !== "going" || eventResponse(event, data.profile.id) === "going")
    && (category === "All events" || event.category === category)
    && `${event.title} ${event.description} ${event.location} ${event.clubName || ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const upcomingCount = data.events.filter(event => !event.removed && Date.parse(event.startsAt) >= Date.now()).length;
  const goingCount = data.events.filter(event => !event.removed && eventResponse(event, data.profile.id) === "going").length;
  const removedCount = data.events.filter(event => event.removed).length;
  return <div className="secondary-view events-view">
    <div className="view-heading"><div><p className="eyebrow">GOOD THINGS ARE HAPPENING</p><h1>Your next “glad I went.”</h1><p className="muted">Plans from your shared space and the clubs you follow.</p></div><button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={17} />Create an event</button></div>
    <section className="events-banner"><div><span className="events-banner-label"><Sparkles size={14} /> A LITTLE MORE CAMPUS, A LITTLE LESS SCROLLING</span><h2>Show up. Connect.<br />Make a memory.</h2><p>The best part of campus is the people in it.</p><div className="events-banner-stats"><span><strong>{upcomingCount}</strong> upcoming events</span><i /><span><strong>{goingCount}</strong> on your calendar</span></div></div><div className="events-banner-illustration" aria-hidden="true"><span className="events-sticker events-sticker-one">YOU<br />BELONG<br />HERE <span>✳</span></span><span className="events-sticker events-sticker-two"><CalendarDays size={45} strokeWidth={1.3} /><span>MAKE IT<br />A PLAN</span></span><span className="events-banner-spark">✦</span><span className="events-banner-circle" /></div></section>
    <div className="event-plan-tabs" aria-label="Your event plans">{([{ id: "all", label: "All plans" }, { id: "going", label: `Going (${goingCount})` }, { id: "removed", label: `Removed (${removedCount})` }] as const).map(item => <button key={item.id} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    <div className="events-filter-row"><div className="secondary-filter-pills" aria-label="Event category">{categories.map(item => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)} aria-pressed={category === item}>{item}</button>)}</div></div>
    {tab === "removed" && <p className="muted">Hidden from your plans only. Restore an event to see it again.</p>}
    <div className="events-grid">{events.map(event => <EventCard key={event.id} event={event} userId={data.profile.id} hostName={data.workspace.members.find(member => member.id === event.host)?.name} onAction={onAction} onOpenEvent={onOpenEvent} />)}</div>
    {!events.length && <div className="panel empty-state"><CalendarDays size={34} /><h3>{tab === "removed" ? "No removed events." : tab === "going" ? "Your next plan is waiting." : "No events here just yet."}</h3><p>{tab === "removed" ? "Choose Not going, then Remove to hide a plan here." : tab === "going" ? "Choose Going on an event to add it here." : "Try another category or create a plan for your space."}</p></div>}
    {showCreate && <CreateEventDialog onAction={onAction} onClose={() => setShowCreate(false)} />}
  </div>;
}

export function EventCard({ event, userId, hostName, onAction, onOpenEvent }: {
  event: CampusEvent; userId: string; hostName?: string; onAction: (action: OrbitAction) => Promise<void>; onOpenEvent?: (id: string) => void;
}) {
  const date = new Date(event.startsAt);
  return <article className="panel event-card"><div className="event-card-art-wrap"><EventArtwork cover={event.cover} category={event.category} /><span className="event-date-badge"><span>{date.toLocaleDateString("en-US", { month: "short" })}</span><strong>{date.getDate()}</strong></span><span className="event-category-badge">{event.clubName || event.category}</span></div><div className="event-card-body"><span className="event-card-host">HOSTED BY {event.hostName || hostName || "Orbit member"}</span><h2>{onOpenEvent ? <button className="event-detail-title" onClick={() => onOpenEvent(event.id)}>{event.title}<ArrowUpRight size={16} /></button> : event.title}</h2><p className="event-card-description">{event.description}</p><div className="event-card-meta"><span><Clock3 size={14} />{date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}{date.getTime() < Date.now() ? " · Past event" : ""}</span><span><MapPin size={14} />{event.location}</span></div><div className="event-card-footer"><span className="event-attendees"><Users size={15} /><strong>{eventGoingCount(event)}</strong> going</span><EventResponseControls event={event} userId={userId} onAction={onAction} /></div></div></article>;
}

export function CreateEventDialog({ onAction, onClose, club }: {
  onAction: (action: OrbitAction) => Promise<void>; onClose: () => void; club?: { id: string; name: string };
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [cover, setCover] = useState("violet");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const startsAt = new Date(String(form.get("startsAt")));
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) { setError("Choose a date and time in the future."); return; }
    setPending(true); setError("");
    const details = { title: String(form.get("title")).trim(), description: String(form.get("description")).trim(), location: String(form.get("location")).trim(), startsAt: startsAt.toISOString(), cover };
    try {
      await onAction(club ? { type: "create_club_event", id, clubId: club.id, ...details } : { type: "create_event", ...details, category: String(form.get("category")) as CampusEvent["category"] });
      onClose();
    } catch (cause) { setError(actionError(cause)); } finally { setPending(false); }
  }
  return <ViewModal title={club ? `Plan something for ${club.name}` : "Good plans start here."} description={club ? "Visible to followers, here and in Events & plans." : "Visible to members of your shared space."} busy={pending} onClose={onClose}><form className="secondary-form" onSubmit={createEvent}>
    <fieldset className="club-create-fields" disabled={pending}>
      <label className="field">Event name<input name="title" required maxLength={100} placeholder="e.g. Coffee & a little conversation" /></label>
      <label className="field">What’s the plan?<textarea name="description" required maxLength={1000} rows={3} placeholder="Let people know what to expect." /></label>
      <div className="form-grid"><label className="field">Date & time<input name="startsAt" type="datetime-local" required /></label>{!club && <label className="field">Category<select name="category" defaultValue="Social">{categories.filter(item => item !== "All events").map(item => <option key={item}>{item}</option>)}</select></label>}</div>
      <label className="field">Location<input name="location" required maxLength={140} placeholder="e.g. Student Center, room 204" /></label>
      <fieldset className="events-cover-picker"><legend>Give it a color</legend>{coverOptions.map(color => <button key={color} type="button" className={`events-cover-swatch events-cover-${color}`} aria-label={`${color} cover`} aria-pressed={cover === color} onClick={() => setCover(color)}>{cover === color && <Check size={19} />}</button>)}</fieldset>
    </fieldset><ActionError error={error} /><div className="secondary-form-actions"><button type="button" className="btn btn-secondary" disabled={pending} onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : "Create event"}</button></div>
  </form></ViewModal>;
}
