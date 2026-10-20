"use client";

import { useState, type FormEvent } from "react";
import { CalendarDays, Check, GraduationCap, Home, Mail, MessageCircle, Pencil, ShieldCheck, Sparkles } from "lucide-react";
import { ActionError, actionError, MemberAvatar, shortDate, type ViewProps } from "./secondary-shared";
import "./secondary.css";

export function ProfileView({ data, onAction }: ViewProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const { profile, workspace } = data;
  const posts = data.posts.filter((post) => post.author.id === profile.id);
  const going = data.events.filter((event) => event.attendees.includes(profile.id));
  const years = Array.from(new Set([profile.year, "Freshman", "Sophomore", "Junior", "Senior", "Graduate student", "Other"].filter(Boolean)));

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true); setError(""); setSaved(false);
    try {
      await onAction({ type: "update_profile", name: String(form.get("name")).trim(), major: String(form.get("major")).trim(), year: String(form.get("year")), bio: String(form.get("bio")).trim() });
      setSaved(true);
    } catch (cause) { setError(actionError(cause)); }
    finally { setPending(false); }
  }

  return <div className="secondary-view profile-view"><div className="view-heading"><div><p className="eyebrow">YOUR OWN LITTLE ORBIT</p><h1>Hey, {profile.name.split(" ")[0]}.</h1><p className="muted">Be yourself. That’s who your people are looking for.</p></div><span className="profile-campus-badge"><GraduationCap size={16} />{profile.university}</span></div>
    <div className="profile-layout"><aside className="profile-sidebar"><section className="panel profile-summary"><div className="profile-summary-cover"><span /><i /><b>✳</b></div><div className="profile-summary-content"><MemberAvatar profile={profile} /><h2>{profile.name}</h2><p>{profile.major || "Finding your next great idea"}</p><span className="profile-year">{profile.graduationYear ? `Class of ${profile.graduationYear}` : profile.year || "Caldwell student"}</span>{profile.bio && <p className="profile-bio">{profile.bio}</p>}<div className="profile-summary-stats"><div><strong>{posts.length}</strong><span>posts</span></div><div><strong>{going.length}</strong><span>events</span></div><div><strong>{workspace.members.length}</strong><span>roommates</span></div></div><span className="profile-campus-line"><GraduationCap size={16} />{profile.university}</span></div></section><section className="profile-note"><Sparkles size={22} strokeWidth={1.5} /><h3>A small intro goes a long way.</h3><p>Your major, a little about you, or what you’re into. Give your campus a chance to say hello.</p></section></aside>
      <div className="profile-main"><section className="panel profile-details"><div className="secondary-section-heading"><div><span className="profile-section-eyebrow"><Pencil size={15} />MAKE IT YOURS</span><h2>Your profile</h2><p className="muted">A few details to help good connections happen.</p></div></div><form className="secondary-form" onSubmit={saveProfile} onChange={() => setSaved(false)}><label className="field">Full name<input name="name" required minLength={2} maxLength={80} defaultValue={profile.name} autoComplete="name" /></label><div className="form-grid"><label className="field">Major<input name="major" required maxLength={100} defaultValue={profile.major} placeholder="What are you studying?" /></label><label className="field">Year<select name="year" defaultValue={profile.year || "Freshman"}>{years.map((year) => <option key={year}>{year}</option>)}</select></label></div><label className="field">A little about you<textarea name="bio" rows={4} maxLength={300} defaultValue={profile.bio} placeholder="A few things you love, what you’re working on, or your ideal coffee order…" /><small className="muted">Up to 300 characters. This appears on your profile.</small></label><div className="profile-readonly-field"><span><GraduationCap size={17} />Your campus</span><strong>{profile.university}</strong></div>{profile.residency && <div className="profile-readonly-field"><span><Home size={17} />Campus life</span><strong>{profile.residency === "resident" ? profile.residenceHall : "Commuter"}</strong></div>}{profile.graduationYear && <div className="profile-readonly-field"><span><GraduationCap size={17} />Graduation year</span><strong>{profile.graduationYear}</strong></div>}{profile.email && <div className="profile-readonly-field"><span><Mail size={17} />Account email</span><strong>{profile.email}</strong></div>}<ActionError error={error} /><div className="profile-save-row"><span role="status">{saved && <><Check size={16} />Profile saved. Looking good.</>}</span><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></div></form></section>
        <section className="panel profile-connections"><div className="secondary-section-heading"><div><h2>A few things in your orbit</h2><p className="muted">The connections you’re making, one day at a time.</p></div></div><div className="profile-connection-row"><span className="secondary-stat-icon lavender"><Home size={20} /></span><div><strong>{workspace.name}</strong><p>{workspace.members.length} {workspace.members.length === 1 ? "member" : "members"} sharing the everyday</p></div><div className="secondary-avatar-stack">{workspace.members.slice(0, 3).map((member) => <MemberAvatar key={member.id} profile={member} small />)}</div></div>{going.slice(0, 2).map((event) => <div className="profile-connection-row" key={event.id}><span className="secondary-stat-icon peach"><CalendarDays size={20} /></span><div><strong>{event.title}</strong><p>{shortDate(event.startsAt)} · {event.location}</p></div><span className="profile-going"><Check size={13} />Going</span></div>)}{posts.length > 0 && <div className="profile-connection-row"><span className="secondary-stat-icon mint"><MessageCircle size={20} /></span><div><strong>You’re part of the conversation</strong><p>{posts.length} {posts.length === 1 ? "post" : "posts"} shared with your campus</p></div></div>}</section>
        <p className="profile-privacy-note"><ShieldCheck size={15} />Your profile helps other students get to know you. Household tasks and expenses stay in your roommate space.</p>
      </div>
    </div>
  </div>;
}
