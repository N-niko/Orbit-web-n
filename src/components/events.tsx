"use client";
import { OrbitSelect } from "./orbit-select";
import { useEffect,useState,type FormEvent } from "react";
import { ArrowUpRight,CalendarDays,Check,Clock3,MapPin,Plus,Sparkles,Users } from "lucide-react";
import type { CampusEvent,OrbitAction } from "@/lib/types";
import { eventDuration,eventEnd,eventGoingCount,eventResponse,eventSchedule,eventStatus,localDateTime,sortEvents,statusLabel,localInstant,suggestedEndInstant } from "@/lib/events";
import { DeleteContentMenu,useContentActions,contentKey } from "./content-actions";
import { EventResponseControls } from "./event-controls";
import { ActionError,ViewModal,actionError,type ViewProps } from "./secondary-shared";
import "./secondary.css";
const categories=["Social","Academic","Clubs","Wellness"];
const coverOptions=["violet","peach","green","blue"];
export function useEventNow(){const [now,setNow]=useState(()=>Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);return now;}
export function EventArtwork({ cover, category, title, compact = false }: { cover: string; category: string; title?: string; compact?: boolean }) {
  const theme = coverOptions.includes(cover) ? cover : "violet";
  return <div className={`event-art event-art-${theme}${compact ? " event-art-compact" : ""}`} aria-hidden="true">
    <span className="event-art-orbit event-art-orbit-one" /><span className="event-art-orbit event-art-orbit-two" /><span className="event-art-star"></span><span className="event-art-small-star"></span>
    <div className="event-art-label"><span>{category}</span><strong>{title || category}</strong></div>
  </div>;
}


export function EventTiming({event}:{event:CampusEvent}) {return <div className="event-schedule"><span><Clock3 size={14}/>{eventSchedule(event)}</span><small>{eventDuration(event)}{!event.endsAt?" · Estimated end (older event)":""}</small></div>;}
export function EventIdentity({event,onOpenClub}:{event:CampusEvent;onOpenClub?:(id:string)=>void}) {
 return <div className="event-identity"><span className="discovery-pill">{event.clubId?"Club Event":event.audience==="workspace"?"Workspace Event":"Campus Event"}</span>{event.clubId&&<button className="event-club-link" onClick={()=>onOpenClub?.(event.clubId!)} disabled={!onOpenClub}><span className={`event-club-logo club-tone-${event.clubColor??"violet"}`} aria-hidden="true"></span>{event.clubName??"Club"}<ArrowUpRight size={13}/></button>}</div>;
}
export function EventsView({data,onAction,search="",onOpenEvent,onOpenClub}:ViewProps&{onOpenEvent?:(id:string)=>void;onOpenClub?:(id:string)=>void}) {
 const [audience,setAudience]=useState("all"),[time,setTime]=useState("upcoming"),[tab,setTab]=useState("all"),[showCreate,setShowCreate]=useState(false);const now=useEventNow();
 const events=sortEvents(data.events.filter(event=>(tab==="removed"?event.removed:!event.removed)
 &&(tab!=="going"||eventResponse(event,data.profile.id)==="going")&&(audience==="all"||event.clubId||event.followingHost)
 &&(time==="all"||(time==="past"?eventStatus(event,now)==="past":eventStatus(event,now)!=="past"))
 &&`${event.title} ${event.description} ${event.location} ${event.clubName??""}`.toLowerCase().includes(search.toLowerCase())),now);
 const active=data.events.filter(e=>!e.removed&&eventStatus(e,now)!=="past").length,going=data.events.filter(e=>!e.removed&&eventResponse(e,data.profile.id)==="going").length,removed=data.events.filter(e=>e.removed).length;
 return <div className="secondary-view events-view"><div className="view-heading"><div><p className="eyebrow">GOOD THINGS ARE HAPPENING</p><h1>Events</h1><p className="muted">Campus plans and events from the clubs you follow.</p></div><button className="btn btn-primary" onClick={()=>setShowCreate(true)}><Plus size={17}/>Create an event</button></div>
 <section className="events-banner"><div><h2>Events & plans</h2><p>What’s coming up on campus and from the clubs you follow.</p><div className="events-banner-stats"><span><strong>{active}</strong> upcoming & active</span><i/><span><strong>{going}</strong> on your calendar</span></div></div><div className="events-banner-illustration" aria-hidden="true"><span className="events-sticker events-sticker-one">YOU<br/>BELONG<br/>HERE <span></span></span><span className="events-sticker events-sticker-two"><CalendarDays size={45} strokeWidth={1.3}/><span>MAKE IT<br/>A PLAN</span></span><span className="events-banner-spark"></span><span className="events-banner-circle"/></div></section>
 <div className="event-plan-tabs" aria-label="Your event plans">{[{id:"all",label:"All plans"},{id:"going",label:`Going (${going})`},{id:"removed",label:`Removed (${removed})`}].map(item=><button key={item.id} aria-pressed={tab===item.id} onClick={()=>setTab(item.id)}>{item.label}</button>)}</div>
 <div className="event-filters"><label>Audience<OrbitSelect aria-label="Event audience" value={audience} onChange={e=>setAudience(e.target.value)}><option value="all">All Events</option><option value="following">Following</option></OrbitSelect></label><label>Time<OrbitSelect aria-label="Event time" value={time} onChange={e=>setTime(e.target.value)}><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All</option></OrbitSelect></label></div>
 {tab==="removed"&&<p className="muted">Hidden from your plans only. Restore an event to see it again.</p>}
 <div className="events-grid">{events.map(event=><EventCard key={event.id} event={event} userId={data.profile.id} onAction={onAction} onOpenEvent={onOpenEvent} onOpenClub={onOpenClub}/>)}</div>
 {!events.length&&<div className="panel empty-state"><CalendarDays size={34}/><h3>No events match these filters.</h3><p>Try another audience or time, or create a campus plan.</p></div>}
 {showCreate&&<CreateEventDialog onAction={onAction} onClose={()=>setShowCreate(false)}/>}</div>;
}
export function EventCard({event,userId,hostName,onAction,onOpenEvent,onOpenClub}:{event:CampusEvent;userId:string;hostName?:string;onAction:(action:OrbitAction)=>Promise<void>;onOpenEvent?:(id:string)=>void;onOpenClub?:(id:string)=>void}) {
 const content=useContentActions();const now=useEventNow(),status=eventStatus(event,now),date=new Date(event.startsAt);const [edit,setEdit]=useState(false);
 if(content?.deleted.has(contentKey("event",event.id)))return null;
 return <article className={`panel event-card${event.clubId?" event-card-club":""}${status==="past"?" event-card-ended":""}`}><div className="event-card-art-wrap"><DeleteContentMenu kind="event" id={event.id} allowed={event.canDelete??event.host===userId}/><EventArtwork cover={event.cover} category={event.category}/><span className="event-date-badge"><span>{date.toLocaleDateString("en-US",{month:"short"})}</span><strong>{date.getDate()}</strong></span><span className="event-category-badge">{statusLabel[status]}</span></div><div className="event-card-body"><EventIdentity event={event} onOpenClub={onOpenClub}/><span className="event-card-host">HOSTED BY {event.hostName||hostName||"Orbit member"}</span><h2>{onOpenEvent?<button className="event-detail-title" onClick={()=>onOpenEvent(event.id)}>{event.title}<ArrowUpRight size={16}/></button>:event.title}</h2><p className="event-card-description">{event.description}</p><div className="event-card-meta"><EventTiming event={event}/><span><MapPin size={14}/>{event.location}</span></div>{event.host===userId&&<button className="text-button event-edit" onClick={()=>setEdit(true)}>Edit schedule</button>}<div className="event-card-footer"><span className="event-attendees"><Users size={15}/><strong>{eventGoingCount(event)}</strong> going</span><EventResponseControls event={event} userId={userId} onAction={onAction} now={now}/></div></div>{edit&&<CreateEventDialog edit={event} onAction={onAction} onClose={()=>setEdit(false)}/>}</article>;
}
export function CreateEventDialog({onAction,onClose,club,edit}:{onAction:(action:OrbitAction)=>Promise<void>;onClose:()=>void;club?:{id:string;name:string};edit?:CampusEvent}) {
 const [id]=useState(()=>edit?.id??crypto.randomUUID()),[cover,setCover]=useState(edit?.cover??"violet"),[error,setError]=useState(""),[pending,setPending]=useState(false);
 const [start,setStart]=useState(edit?edit.startsAt:""),[end,setEnd]=useState(edit?new Date(eventEnd(edit)).toISOString():""),[endChanged,setEndChanged]=useState(false);
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);const startsAt=new Date(start),endsAt=new Date(end);
 if(!Number.isFinite(startsAt.getTime())||(!edit&&startsAt.getTime()<=Date.now())){setError("Choose a start date and time in the future.");return;}
 if(!Number.isFinite(endsAt.getTime())||endsAt<=startsAt){setError("End time must be after start time.");return;}
 setPending(true);setError("");try{
 const schedule={id,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString()};
 const details={...schedule,title:String(form.get("title")).trim(),description:String(form.get("description")).trim(),location:String(form.get("location")).trim(),cover};
 await onAction(edit?{type:"edit_event_schedule",...schedule}:club?{type:"create_club_event",clubId:club.id,...details}:{type:"create_event",...details,category:String(form.get("category")) as CampusEvent["category"]});onClose();
 }catch(cause){setError(actionError(cause));}finally{setPending(false);}}
 const duration=start&&end&&Date.parse(end)>Date.parse(start)?eventDuration({startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString()}):"";
 return <ViewModal title={edit?"Edit event schedule":club?`Plan something for ${club.name}`:"Good plans start here."} description={edit?edit.title:club?"Visible to club followers, here and in Events & plans.":"Visible to all signed-in Orbit students."} busy={pending} onClose={onClose}><form className="secondary-form" onSubmit={save}><fieldset className="club-create-fields" disabled={pending}>
 {!edit&&<><label className="field">Event name<input name="title" required maxLength={100} placeholder="e.g. Study group, Rosary Hall lounge"/></label><label className="field">What’s the plan?<textarea name="description" required maxLength={1000} rows={3} placeholder="Let people know what to expect."/></label></>}
 <div className="form-grid"><label className="field">Start Date & Time<input name="startsAt" type="datetime-local" required value={start?localDateTime(start):""} onInput={e=>{const value=localInstant(e.currentTarget.value);setStart(value);if(!endChanged)setEnd(suggestedEndInstant(value));}}/></label><label className="field">End Date & Time<input name="endsAt" type="datetime-local" required value={end?localDateTime(end):""} onInput={e=>{setEnd(localInstant(e.currentTarget.value));setEndChanged(true);}}/></label></div><p className="muted">{duration?`Duration: ${duration}. `:""}Times use your device’s timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
 {!edit&&<>{!club&&<label className="field">Category<OrbitSelect aria-label="Event category" name="category" defaultValue="Social">{categories.map(item=><option key={item}>{item}</option>)}</OrbitSelect></label>}<label className="field">Location<input name="location" required maxLength={140} placeholder="e.g. Student Center, room 204"/></label><fieldset className="events-cover-picker"><legend>Give it a color</legend>{coverOptions.map(color=><button key={color} type="button" className={`events-cover-swatch events-cover-${color}`} aria-label={`${color} cover`} aria-pressed={cover===color} onClick={()=>setCover(color)}>{cover===color&&<Check size={19}/>}</button>)}</fieldset></>}
 </fieldset><ActionError error={error}/><div className="secondary-form-actions"><button type="button" className="btn btn-secondary" disabled={pending} onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}>{pending?"Saving…":edit?"Save schedule":"Create event"}</button></div></form></ViewModal>;
}
