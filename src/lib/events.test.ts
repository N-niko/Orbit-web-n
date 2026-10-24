import { describe, expect, it } from "vitest";
import { eventGoingCount, eventResponse } from "./events";
import { applyDemoAction, createDemoData } from "./demo";
import { defaultVisibility } from "./discovery";
import { buildDirectory } from "./discovery";
const now = new Date("2026-10-23T15:00:00Z");
describe("event plans", () => {
  it("keeps Going idempotent and makes removal reversible", () => {
    let data = createDemoData(now); const id = data.events[0].id; const user = data.profile.id;
    data = applyDemoAction(data, { type: "respond_event", id, response: "going" }, now);
    data = applyDemoAction(data, { type: "respond_event", id, response: "going" }, now);
    expect(data.events[0].attendees.filter(value => value === user)).toHaveLength(1);
    expect(() => applyDemoAction(data, { type: "remove_event", id }, now)).toThrow("Not going");
    data = applyDemoAction(data, { type: "respond_event", id, response: "not_going" }, now);
    data = applyDemoAction(data, { type: "remove_event", id }, now);
    expect(data.events[0].removed).toBe(true);
    expect(buildDirectory(data, true).events.some(event => event.id === id)).toBe(false);
    data = applyDemoAction(data, { type: "restore_event", id }, now);
    expect(data.events[0].removed).toBe(false);
    expect(eventResponse(data.events[0], user)).toBe("not_going");
  });
  it("uses the safe club attendance count without requiring a list of other people", () => {
    const event = { ...createDemoData(now).events[0], attendees: [], attendeeCount: 8 };
    expect(eventGoingCount(event)).toBe(8);
    expect(eventResponse(event, "alex")).toBe(null);
  });
});
describe("profile posts", () => {
  it("uses the profile setting for all posts", () => {
    let data=createDemoData(now);
    data=applyDemoAction(data,{type:"create_post",body:"Profile post",category:"general"},now);
    const id=data.posts[0].id;
    expect(buildDirectory(data,true).people.find(person=>person.profile.id===data.profile.id)?.posts?.some(post=>post.id===id)).toBe(true);
    expect(buildDirectory(data,true,{...defaultVisibility,posts:false}).people.find(person=>person.profile.id===data.profile.id)?.posts).toBe(null);
  });
});
