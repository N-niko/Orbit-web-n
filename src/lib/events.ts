import type { CampusEvent } from "./types";
export const LEGACY_EVENT_HOURS = 2;
export function eventEnd(event: Pick<CampusEvent,"startsAt"|"endsAt">) { return event.endsAt ? Date.parse(event.endsAt) : Date.parse(event.startsAt) + LEGACY_EVENT_HOURS * 3600000; }
/** Same boundaries as orbit_private.event_status: the end instant belongs to Past. */
export function eventStatus(event: Pick<CampusEvent,"startsAt"|"endsAt">, now = Date.now()): "upcoming"|"in_progress"|"past" {
 return now >= eventEnd(event) ? "past" : now < Date.parse(event.startsAt) ? "upcoming" : "in_progress";
}
export const statusLabel = {upcoming:"Upcoming",in_progress:"In progress",past:"Ended"};
export function eventDuration(event: Pick<CampusEvent,"startsAt"|"endsAt">) {
 const minutes=Math.round((eventEnd(event)-Date.parse(event.startsAt))/60000);
 if(!Number.isFinite(minutes)||minutes<=0)return "";
 const days=Math.floor(minutes/1440), hours=Math.floor(minutes%1440/60), mins=minutes%60;
 return [days?`${days} ${days===1?"day":"days"}`:"",hours?`${hours} ${hours===1?"hour":"hours"}`:"",mins?`${mins} ${mins===1?"minute":"minutes"}`:""].filter(Boolean).join(" ");
}
export function sortEvents(events: CampusEvent[], now=Date.now()) {
 const rank={in_progress:0,upcoming:1,past:2};
 return [...events].sort((a,b)=>rank[eventStatus(a,now)]-rank[eventStatus(b,now)] || (eventStatus(a,now)==="past"?eventEnd(b)-eventEnd(a):Date.parse(a.startsAt)-Date.parse(b.startsAt)) || a.id.localeCompare(b.id));
}
export function eventResponse(event: CampusEvent,userId:string) {return event.response ?? (event.attendees.includes(userId)?"going":null);}
export const eventGoingCount=(event:CampusEvent)=>event.attendeeCount??event.attendees.length;
export function localDateTime(value:string|number) {const date=new Date(value);const pad=(n:number)=>String(n).padStart(2,"0");return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}
export function localInstant(value:string) {const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():"";}
export function suggestedEndInstant(value:string) {const start=new Date(value);return Number.isFinite(start.getTime())?new Date(start.getTime()+7200000).toISOString():"";}
export function suggestedEnd(value:string) {const end=suggestedEndInstant(value);return end?localDateTime(end):"";}
export function eventSchedule(event:Pick<CampusEvent,"startsAt"|"endsAt">) {
 const options:Intl.DateTimeFormatOptions={month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"};
 return `${new Date(event.startsAt).toLocaleString("en-US",options)} – ${new Date(eventEnd(event)).toLocaleString("en-US",options)}`;
}
