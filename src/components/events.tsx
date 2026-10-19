"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, CalendarDays, Check, Clock3, MapPin, Plus, Sparkles, Users } from "lucide-react";
import type { CampusEvent } from "@/lib/types";
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

export function EventsView({ data, onAction, search = "" }: ViewProps) {
  const [category, setCategory] = useState<string>("All events");
  const [mineOnly, setMineOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [cover, setCover] = useState("violet");
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const events = data.events.filter((event) => (category === "All events" || event.category === category) && (!mineOnly || event.attendees.includes(data.profile.id)) && `${event.title} ${event.description} ${event.location}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const upcomingCount = data.events.filter((event) => Date.parse(event.startsAt) >= Date.now()).length;
  const goingCount = data.events.filter((event) => event.attendees.includes(data.profile.id)).length;

  async function rsvp(event: CampusEvent) {
    setPending(event.id); setError("");
    try { await onAction({ type: "toggle_rsvp", id: event.id }); }
    catch (cause) { setError(actionError(cause)); }
    finally { setPending(""); }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startsAt = new Date(String(form.get("startsAt")));
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) { setError("Choose a date and time in the future."); return; }
    setPending("create"); setError("");
    try {
      await onAction({ type: "create_event", title: String(form.get("title")).trim(), description: String(form.get("description")).trim(), location: String(form.get("location")).trim(), startsAt: startsAt.toISOString(), category: String(form.get("category")) as CampusEvent["category"], cover });
      setShowCreate(false);
    } catch (cause) { setError(actionError(cause)); }
    finally { setPending(""); }
  }

  return <div className="secondary-view events-view">
    <div className="view-heading"><div><p className="eyebrow">GOOD THINGS ARE HAPPENING</p><h1>Your next “glad I went.”</h1><p className="muted">Find something to do. Find someone to go with.</p></div><button className="btn btn-primary" onClick={() => { setError(""); setShowCreate(true); }}><Plus size={17} />Create an event</button></div>
    <section className="events-banner"><div><span className="events-banner-label"><Sparkles size={14} /> A LITTLE MORE CAMPUS, A LITTLE LESS SCROLLING</span><h2>Show up. Connect.<br />Make a memory.</h2><p>The best part of campus is the people in it.</p><div className="events-banner-stats"><span><strong>{upcomingCount}</strong> upcoming events</span><i /><span><strong>{goingCount}</strong> on your calendar</span></div></div><div className="events-banner-illustration" aria-hidden="true"><span className="events-sticker events-sticker-one">YOU<br />BELONG<br />HERE <span>✳</span></span><span className="events-sticker events-sticker-two"><CalendarDays size={45} strokeWidth={1.3} /><span>MAKE IT<br />A PLAN</span></span><span className="events-banner-spark">✦</span><span className="events-banner-circle" /></div></section>
    <div className="events-filter-row"><div className="secondary-filter-pills" aria-label="Event category">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)} aria-pressed={category === item}>{item}</button>)}</div><button className={`events-mine-toggle${mineOnly ? " active" : ""}`} onClick={() => setMineOnly(!mineOnly)} aria-pressed={mineOnly}><CalendarDays size={16} />My events {goingCount > 0 && <span>{goingCount}</span>}</button></div>
    {!showCreate && <ActionError error={error} />}
    <div className="events-grid">{events.map((event) => {
      const date = new Date(event.startsAt);
      const going = event.attendees.includes(data.profile.id);
      const hostName = data.workspace.members.find((member) => member.id === event.host)?.name || event.host;
      const past = date.getTime() < Date.now();
      return <article key={event.id} className="panel event-card"><div className="event-card-art-wrap"><EventArtwork cover={event.cover} category={event.category} /><span className="event-date-badge"><span>{date.toLocaleDateString("en-US", { month: "short" })}</span><strong>{date.getDate()}</strong></span><span className="event-category-badge">{event.category}</span></div><div className="event-card-body"><span className="event-card-host">HOSTED BY {hostName}</span><h2>{event.title}</h2><p className="event-card-description">{event.description}</p><div className="event-card-meta"><span><Clock3 size={14} />{date.toLocaleDateString("en-US", { weekday: "short" })}, {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}{past ? " · Past event" : ""}</span><span><MapPin size={14} />{event.location}</span></div><div className="event-card-footer"><span className="event-attendees"><Users size={15} /><strong>{event.attendees.length}</strong> going</span><button className={`btn ${going ? "btn-secondary event-rsvp-going" : "btn-primary"}`} disabled={Boolean(pending) || (past && !going)} onClick={() => rsvp(event)} aria-label={`${going ? "Cancel RSVP for" : "RSVP to"} ${event.title}`}>{pending === event.id ? "Saving…" : going ? <><Check size={15} />Going</> : past ? "Event ended" : <><span>I’m in</span><ArrowUpRight size={15} /></>}</button></div></div></article>;
    })}</div>
    {!events.length && <div className="panel empty-state"><CalendarDays size={34} /><h3>{mineOnly ? "Your next plan is waiting" : "No events here just yet"}</h3><p>{mineOnly ? "Tap “I’m in” on an event to add it here." : "Try another filter or bring people together with an event of your own."}</p>{!mineOnly && <button className="btn btn-primary" onClick={() => { setError(""); setShowCreate(true); }}><Plus size={16} />Create an event</button>}</div>}
    {showCreate && <ViewModal title="Good plans start here." description="Big hangout or small study session. Make it happen." busy={Boolean(pending)} onClose={() => setShowCreate(false)}><form className="secondary-form" onSubmit={createEvent}>
      <label className="field">Event name<input name="title" required maxLength={100} placeholder="e.g. Coffee & a little conversation" /></label>
      <label className="field">What’s the plan?<textarea name="description" required maxLength={1000} rows={3} placeholder="Let people know what to expect." /></label>
      <div className="form-grid"><label className="field">Date & time<input name="startsAt" type="datetime-local" required /></label><label className="field">Category<select name="category" defaultValue="Social">{categories.filter((item) => item !== "All events").map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <label className="field">Location<input name="location" required maxLength={140} placeholder="e.g. Student Center, room 204" /></label>
      <fieldset className="events-cover-picker"><legend>Give it a color</legend>{coverOptions.map((color) => <button key={color} type="button" className={`events-cover-swatch events-cover-${color}`} aria-label={`${color} cover`} aria-pressed={cover === color} onClick={() => setCover(color)}>{cover === color && <Check size={19} />}</button>)}</fieldset>
      <ActionError error={error} /><div className="secondary-form-actions"><button type="button" className="btn btn-secondary" disabled={Boolean(pending)} onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={Boolean(pending)}>{pending ? "Creating…" : "Create event"}</button></div>
    </form></ViewModal>}
  </div>;
}
