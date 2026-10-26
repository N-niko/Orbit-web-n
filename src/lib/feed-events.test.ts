import { describe,it,expect } from "vitest";
import { createDemoData,applyDemoAction } from "./demo";
import { eventStatus,eventEnd,eventDuration,eventSchedule,localDateTime,suggestedEnd,suggestedEndInstant,sortEvents } from "./events";
import { demoFeed,mergeFeed,feedCursorSchema } from "./feed";
import { orbitActionSchema } from "./server/validation";
const now=new Date("2026-10-25T17:00:00Z");
describe("event scheduling",()=>{
 const event={startsAt:"2026-10-26T23:30:00-04:00",endsAt:"2026-10-27T01:30:00-04:00"};
 it("handles overnight UTC instants and exact boundaries",()=>{
  expect(eventStatus(event,Date.parse("2026-10-27T03:29:59Z"))).toBe("upcoming");
  expect(eventStatus(event,Date.parse("2026-10-27T03:30:00Z"))).toBe("in_progress");
  expect(eventStatus(event,Date.parse("2026-10-27T05:30:00Z"))).toBe("past");
  expect(eventDuration(event)).toBe("2 hours");expect(eventSchedule(event)).toContain(" – ");
 });
 it("uses a two-hour fallback only for older events without an end",()=>{
  const legacy={startsAt:"2026-10-25T16:00:00Z",endsAt:null};
  expect(eventEnd(legacy)).toBe(Date.parse("2026-10-25T18:00:00Z"));expect(eventStatus(legacy,now.getTime())).toBe("in_progress");
 });
 it("formats minutes, days and a two-hour local suggestion across DST",()=>{
  expect(eventDuration({startsAt:now.toISOString(),endsAt:new Date(+now+2700000).toISOString()})).toBe("45 minutes");
  expect(eventDuration({startsAt:now.toISOString(),endsAt:new Date(+now+86400000).toISOString()})).toBe("1 day");
  const local=localDateTime("2026-11-01T04:30:00Z");expect(Date.parse(suggestedEndInstant(local))-Date.parse(local)).toBe(7200000);expect(suggestedEnd(local)).toBe(localDateTime(suggestedEndInstant(local)));
 });
 it("requires new end timestamps, validates order, and rejects owner forgery",()=>{
  const action={type:"create_event",title:"Night study",description:"Notes",location:"Library",category:"Academic",cover:"blue",...event};
  expect(orbitActionSchema.safeParse(action).success).toBe(true);
  expect(orbitActionSchema.safeParse({...action,endsAt:undefined}).success).toBe(false);
  expect(orbitActionSchema.safeParse({...action,endsAt:event.startsAt}).success).toBe(false);
  expect(orbitActionSchema.safeParse({...action,host:"forged"}).success).toBe(false);
  expect(orbitActionSchema.safeParse({...action,type:"create_club_event",id:"a0000000-0000-4000-8000-000000000041",clubId:"a0000000-0000-4000-8000-000000000020",category:undefined}).success).toBe(false); // strict schema rejects extra category
 });
 it("allows both RSVP choices before and during an event, never after its end",()=>{
  const initial=createDemoData(now),event=initial.events.find(e=>e.id==="event-4")!;
  for(const time of [Date.parse(event.startsAt)-1,+now])for(const response of ["going","not_going"] as const){const data=applyDemoAction(initial,{type:"respond_event",id:event.id,response},new Date(time));expect(data.events.find(e=>e.id===event.id)?.response).toBe(response);}
  for(const response of ["going","not_going"] as const)expect(()=>applyDemoAction(initial,{type:"respond_event",id:event.id,response},new Date(eventEnd(event)))).toThrow("ended");
  const past=initial.events.find(e=>e.id==="event-5")!;expect(past.response).toBe("going");
 });
 it("sorts in progress, upcoming soonest, then past most recently ended",()=>{
  const data=createDemoData(now);const events=sortEvents(data.events,+now);expect(events[0].id).toBe("event-4");expect(events.at(-1)?.id).toBe("event-5");
  expect(()=>applyDemoAction(data,{type:"edit_event_schedule",id:"event-1",...event},now)).toThrow("creator");
  const edited=applyDemoAction(data,{type:"edit_event_schedule",id:"event-4",...event},now);expect(edited.events.find(e=>e.id==="event-4")?.endsAt).toBe(event.endsAt);
 });
});
describe("global feed",()=>{
 it("includes only eligible club events and follows explicit post audiences",()=>{
  const data=createDemoData(now);data.posts[0].audience="followers";
  const initial=demoFeed(data,[]);expect(initial.some(i=>i.id===data.posts[0].id)).toBe(false);
  expect(initial.filter(i=>i.kind==="event").map(i=>i.id)).toEqual(["event-2"]);
  const followed=demoFeed(data,[{followerId:"alex",followedId:"maya"}]);expect(followed.some(i=>i.id===data.posts[0].id)).toBe(true);
  const switched=applyDemoAction(data,{type:"create_workspace",name:"New space"},now);expect(demoFeed(switched,[]).map(i=>i.id)).toEqual(initial.map(i=>i.id));
 });
 it("deduplicates pages by kind and ID and preserves publication order",()=>{
  const items=demoFeed(createDemoData(now),[]);expect(mergeFeed(items,items)).toHaveLength(items.length);
  expect(mergeFeed(items.slice(2),items.slice(0,3)).map(i=>i.id)).toEqual(items.map(i=>i.id));
  expect(feedCursorSchema.safeParse({publishedAt:"2026-01-01T00:00:00.123456+00:00",id:"a0000000-0000-4000-8000-000000000041",kind:"event"}).success).toBe(true);
  expect(feedCursorSchema.safeParse({publishedAt:now.toISOString(),id:"invalid",kind:"post"}).success).toBe(false);
 });
});
