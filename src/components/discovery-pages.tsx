"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, BookOpen, CalendarDays, Check, Eye, GraduationCap, Heart, LockKeyhole, MapPin, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { defaultVisibility, visibilityLabels, visibleClubMembers, type DemoClub, type Directory, type DirectoryPerson, type ProfileVisibility, type SearchTarget, type VisibilityField } from "@/lib/discovery";
import type { CampusEvent, OrbitAction, OrbitData } from "@/lib/types";
import { MemberAvatar } from "./secondary-shared";
import { EventArtwork } from "./events";
import "./discovery.css";

export function ProfileVisibilitySettings({ value, onChange, onPreview, demo }: { value: ProfileVisibility; onChange: (field: VisibilityField, visible: boolean) => Promise<void>; onPreview: () => void; demo: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function change(field: VisibilityField, visible: boolean) {
    setPending(true); setMessage(""); setError("");
    try { await onChange(field, visible); setMessage(demo ? "Preview updated." : "Visibility saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your visibility. Try again."); }
    finally { setPending(false); }
  }
  const fields: VisibilityField[] = demo ? Object.keys(defaultVisibility) as VisibilityField[] : ["major", "year", "bio"];
  return <section className="panel visibility-settings"><div className="discovery-section-heading"><div><span className="discovery-eyebrow"><ShieldCheck size={15} />PROFILE VISIBILITY</span><h2>Choose what you share.</h2></div><button className="btn btn-secondary" onClick={onPreview}><Eye size={15} />Preview my profile</button></div>
    <p className="muted">Choose which details other students see. Your name and campus stay visible.</p>
    <div className="visibility-options">{fields.map(field => <label key={field}><span><strong>{visibilityLabels[field]}</strong><small>{value[field] ? "Visible on your profile" : "Hidden from other students"}</small></span><input type="checkbox" role="switch" checked={value[field]} disabled={pending} aria-label={`Show ${visibilityLabels[field].toLowerCase()} on my profile`} onChange={event => { void change(field, event.target.checked); }} /><i aria-hidden="true" /></label>)}</div>
    <p role="status" className="muted">{pending ? "Saving visibility…" : message}</p>{error && <p className="form-error" role="alert">{error}</p>}
    <p className="visibility-demo-note">{demo ? "Demo changes reset when you leave." : "Changes save automatically. These switches also hide details from search. Posts keep their existing shared-space audience."}</p>
  </section>;
}

function HiddenDetail({ label }: { label: string }) { return <p className="hidden-detail"><LockKeyhole size={15} />{label} aren’t shared on this profile.</p>; }
function DetailLink({ title, detail, Icon, onClick }: { title: string; detail: string; Icon: typeof Users; onClick: () => void }) {
  return <button className="discovery-link" onClick={onClick}><span className="discovery-link-icon"><Icon size={20} /></span><span><strong>{title}</strong><small>{detail}</small></span><ArrowUpRight size={16} /></button>;
}

export function DiscoveryPage({ target, directory, data, demo, onOpen, onBack, onAction, onPrivacy }: {
  target: SearchTarget; directory: Directory; data: OrbitData; demo: boolean;
  onOpen: (target: SearchTarget) => void; onBack: () => void;
  onAction: (action: OrbitAction) => Promise<void>; onPrivacy: () => void;
}) {
  useEffect(() => { document.getElementById("discovery-heading")?.focus(); }, [target.type, target.id]);
  const person = target.type === "person" ? directory.people.find(person => person.profile.id === target.id) : undefined;
  const club = target.type === "club" ? directory.clubs.find(club => club.id === target.id) : undefined;
  const event = target.type === "event" ? data.events.find(event => event.id === target.id) : undefined;
  return <div className="secondary-view discovery-page"><button className="discovery-back" onClick={onBack}><ArrowLeft size={16} />Back to your Orbit</button>
    {person ? <PublicPerson person={person} clubs={directory.clubs} onOpen={onOpen} own={person.profile.id === data.profile.id} demo={demo} onPrivacy={onPrivacy} /> :
      club ? <ClubPreview club={club} directory={directory} onOpen={onOpen} /> :
      event ? <EventDetail key={event.id} event={event} directory={directory} userId={data.profile.id} onAction={onAction} demo={demo} onOpen={onOpen} /> :
      <section className="panel empty-state"><h1 id="discovery-heading" tabIndex={-1}>This page is no longer available.</h1><p>Search again to find another person, club, or event.</p></section>}
  </div>;
}

function PublicPerson({ person, clubs, onOpen, own, demo, onPrivacy }: { person: DirectoryPerson; clubs: DemoClub[]; onOpen: (target: SearchTarget) => void; own: boolean; demo: boolean; onPrivacy: () => void }) {
  const { profile, courses, clubIds, posts } = person;
  return <>
    <section className="panel public-profile-hero"><div className="public-profile-cover"><span>IN YOUR ORBIT</span><i>✳</i></div><div className="public-profile-intro"><MemberAvatar profile={profile} /><div><span className="discovery-pill">{own ? "Your profile · visitor preview" : "Student profile"}</span><h1 id="discovery-heading" tabIndex={-1}>{profile.name}</h1><p><GraduationCap size={16} />{profile.university}</p></div>{own && <button className="btn btn-secondary" onClick={onPrivacy}><ShieldCheck size={16} />Edit visibility</button>}</div></section>
    <div className="discovery-columns"><div className="discovery-main">
      <section className="panel discovery-section"><div className="discovery-section-heading"><h2>A little about {own ? "you" : profile.name.split(" ")[0]}</h2><span className="discovery-muted-label">{demo ? "Demo profile" : posts === null ? "Orbit directory" : "Shared in your workspace"}</span></div>
        {profile.bio ? <p className="public-bio">{profile.bio}</p> : <p className="hidden-detail">No bio shared.</p>}
        {(profile.major || profile.year || profile.graduationYear) && <div className="public-facts">{profile.major && <div><span>MAJOR</span><strong>{profile.major}</strong></div>}{(profile.year || profile.graduationYear) && <div><span>YEAR</span><strong>{profile.graduationYear ? `Class of ${profile.graduationYear}` : profile.year}</strong></div>}</div>}
      </section>
      <section className="discovery-posts"><div className="discovery-section-heading"><h2>Posts</h2>{posts && <span className="discovery-muted-label">{posts.length} shared</span>}</div>
        {posts === null ? <section className="panel discovery-section"><HiddenDetail label="Posts" /></section> : posts.length ? posts.map(post => <article className="panel public-post" key={post.id}><div className="public-post-author"><MemberAvatar profile={profile} /><div><strong>{profile.name}</strong><small>{new Date(post.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {post.category === "marketplace" ? "Marketplace" : post.category === "question" ? "Question" : "Update"}</small></div></div><p>{post.body}</p><div className="public-post-stats"><span><Heart size={14} />{post.likeCount} likes</span><span><MessageCircle size={14} />{post.commentCount} comments</span></div></article>) : <section className="panel empty-state"><MessageCircle size={25} /><h3>No posts yet.</h3><p>A good conversation has to start somewhere.</p></section>}
      </section>
    </div><aside className="discovery-side">
      <section className="panel discovery-section"><div className="discovery-section-heading"><h2><Users size={18} />Clubs</h2></div>{clubIds === null ? <HiddenDetail label="Club memberships" /> : clubIds.length ? clubs.filter(club => clubIds.includes(club.id)).map(club => <DetailLink key={club.id} title={club.name} detail="Club · Demo preview" Icon={Users} onClick={() => onOpen({ type: "club", id: club.id })} />) : <p className="hidden-detail">No clubs shared yet.</p>}</section>
      <section className="panel discovery-section"><div className="discovery-section-heading"><h2><BookOpen size={18} />Courses</h2></div>{courses === null ? <HiddenDetail label="Courses" /> : courses.length ? <ul className="public-course-list">{courses.map(course => <li key={course}><BookOpen size={15} />{course}</li>)}</ul> : <p className="hidden-detail">No courses shared yet.</p>}{demo && courses && <p className="discovery-footnote">Illustrative demo courses.</p>}</section>
      <p className="discovery-privacy-note"><ShieldCheck size={16} />People choose which profile details they share.</p>
    </aside></div>
  </>;
}

function ClubPreview({ club, directory, onOpen }: { club: DemoClub; directory: Directory; onOpen: (target: SearchTarget) => void }) {
  const members = visibleClubMembers(directory.people, club.id);
  const events = directory.events.filter(event => club.eventIds.includes(event.id));
  return <><section className={`panel club-preview-hero club-color-${club.color}`}><span className="discovery-pill">Club · Demo preview</span><span className="club-symbol" aria-hidden="true">✳</span><p className="eyebrow">{club.category.toUpperCase()}</p><h1 id="discovery-heading" tabIndex={-1}>{club.name}</h1><p>{club.description}</p></section>
    <p className="club-demo-notice">A fictional preview of how clubs will look in Orbit. Club joining and management will come later.</p>
    <div className="discovery-columns"><div className="discovery-main"><section className="panel discovery-section"><h2>Get together.</h2><p className="club-meeting"><MapPin size={18} />{club.meeting}</p></section><section className="panel discovery-section"><div className="discovery-section-heading"><h2>Upcoming plans</h2><span className="discovery-muted-label">Demo events</span></div>{events.map(event => <DetailLink key={event.id} title={event.title} detail={`${new Date(event.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${event.location}`} Icon={CalendarDays} onClick={() => onOpen({ type: "event", id: event.id })} />)}{!events.length && <p className="hidden-detail">No plans shared yet.</p>}</section></div>
    <aside className="discovery-side"><section className="panel discovery-section"><div className="discovery-section-heading"><h2>People to meet</h2></div><p className="discovery-footnote">Only people who share this club on their profile appear here.</p>{members.map(person => <button className="public-member" key={person.profile.id} onClick={() => onOpen({ type: "person", id: person.profile.id })}><MemberAvatar profile={person.profile} /><span><strong>{person.profile.name}</strong><small>Person{person.profile.major && ` · ${person.profile.major}`}</small></span><ArrowUpRight size={15} /></button>)}{!members.length && <p className="hidden-detail">No public members listed.</p>}</section></aside></div>
  </>;
}

function EventDetail({ event, directory, userId, onAction, demo, onOpen }: { event: CampusEvent; directory: Directory; userId: string; onAction: (action: OrbitAction) => Promise<void>; demo: boolean; onOpen: (target: SearchTarget) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const host = directory.people.find(person => person.profile.id === event.host);
  const going = event.attendees.includes(userId);
  const past = new Date(event.startsAt).getTime() < Date.now();
  async function rsvp() { setPending(true); setError(""); try { await onAction({ type: "toggle_rsvp", id: event.id }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); } finally { setPending(false); } }
  return <><section className="panel discovery-event-hero"><EventArtwork cover={event.cover} category={event.category} title={event.title} /><div className="discovery-event-heading"><span className="discovery-pill">Event · {demo ? "Demo" : event.category}</span><h1 id="discovery-heading" tabIndex={-1}>{event.title}</h1><p>{event.description}</p></div></section><div className="discovery-columns"><section className="panel discovery-section"><h2>The details</h2><div className="event-detail-facts"><p><CalendarDays size={20} />{new Date(event.startsAt).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</p><p><MapPin size={20} />{event.location}</p><p><Users size={20} />{event.attendees.length} going</p></div>{host && <><h2>Your host</h2><button className="public-member" onClick={() => onOpen({ type: "person", id: host.profile.id })}><MemberAvatar profile={host.profile} /><span><strong>{host.profile.name}</strong><small>View student profile</small></span><ArrowUpRight size={16} /></button></>}</section><aside className="discovery-side"><section className="panel discovery-section"><h2>{going ? "You’re on the list." : "Make it a plan."}</h2><p className="discovery-rsvp-copy">{demo ? "Try an RSVP in the demo. It won’t contact anyone." : "Let your workspace know you’re joining."}</p>{error && <p className="form-error" role="alert">{error}</p>}<button className={`btn ${going ? "btn-secondary" : "btn-primary"} discovery-rsvp`} disabled={pending || (past && !going)} onClick={rsvp}>{pending ? "Saving…" : going ? <><Check size={16} />Going · cancel RSVP</> : past ? "Event ended" : "I’m in"}</button></section></aside></div></>;
}
