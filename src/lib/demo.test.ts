import { describe, expect, it } from "vitest";
import { applyDemoAction, createDemoData } from "./demo";

const now = new Date("2026-10-18T15:00:00.000Z");

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

describe("demo data", () => {
  it("creates independent fictional data with future events relative to the supplied date", () => {
    const first = createDemoData(now);
    const second = createDemoData(now);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.workspace.members).toHaveLength(4);
    expect(first.profile.email).toBe("alex@example.com");
    expect(first.events.every((event) => new Date(event.startsAt) > now)).toBe(true);
  });
});

describe("applyDemoAction", () => {
  it("creates a post immutably and uses the supplied clock", () => {
    const previous = freezeDeep(createDemoData(now));
    const next = applyDemoAction(previous, { type: "create_post", body: "  Coffee after class?  ", category: "general" }, now);
    expect(previous.posts).toHaveLength(4);
    expect(next.posts).toHaveLength(5);
    expect(next.posts[0]).toMatchObject({ body: "Coffee after class?", createdAt: now.toISOString(), likes: [], comments: [] });
    expect(next.posts[0].author).toEqual(previous.profile);
    expect(next.posts[0].id).not.toBe(previous.posts[0].id);
    expect(next.tasks).toBe(previous.tasks);
  });

  it("toggles only the current member's like and RSVP without duplicates", () => {
    const previous = freezeDeep(createDemoData(now));
    const liked = applyDemoAction(previous, { type: "toggle_like", id: "post-1" }, now);
    expect(liked.posts[0].likes).toEqual(["jordan", "sam", "alex"]);
    const unliked = applyDemoAction(liked, { type: "toggle_like", id: "post-1" }, now);
    expect(unliked.posts).toEqual(previous.posts);

    const going = applyDemoAction(previous, { type: "toggle_rsvp", id: "event-1" }, now);
    expect(going.events[0].attendees.filter((id) => id === "alex")).toHaveLength(1);
    const notGoing = applyDemoAction(going, { type: "toggle_rsvp", id: "event-1" }, now);
    expect(notGoing.events).toEqual(previous.events);
  });

  it("keeps comments on their own post and updates embedded profile references", () => {
    const previous = freezeDeep(createDemoData(now));
    const commented = applyDemoAction(previous, { type: "add_comment", id: "post-1", body: "See you there!" }, now);
    expect(commented.posts[0].comments).toHaveLength(2);
    expect(previous.posts[0].comments).toHaveLength(1);
    expect(commented.posts[1]).toBe(previous.posts[1]);
    const updated = applyDemoAction(freezeDeep(commented), { type: "update_profile", name: "Alex Taylor", major: "Design", year: "Senior", bio: "Hello, campus." }, now);
    expect(updated.profile.name).toBe("Alex Taylor");
    expect(updated.workspace.members[0].name).toBe("Alex Taylor");
    expect(updated.posts[0].comments.at(-1)?.author.name).toBe("Alex Taylor");
    expect(updated.posts.find((post) => post.author.id === "alex")?.author.name).toBe("Alex Taylor");
    expect(commented.profile.name).toBe("Alex Morgan");
  });

  it("rounds expense amounts to cents and rejects invalid amounts or nonmembers", () => {
    const previous = freezeDeep(createDemoData(now));
    const next = applyDemoAction(previous, { type: "create_expense", title: "Coffee", amount: 12.345, paidBy: "alex" }, now);
    expect(next.expenses[0].amount).toBe(12.35);
    expect(previous.expenses).toHaveLength(3);
    for (const amount of [0, -10, Number.NaN, Number.POSITIVE_INFINITY, 1_000_001, 0.001]) {
      expect(() => applyDemoAction(previous, { type: "create_expense", title: "Coffee", amount, paidBy: "alex" }, now)).toThrow();
    }
    expect(() => applyDemoAction(previous, { type: "create_expense", title: "Coffee", amount: 10, paidBy: "unknown" }, now)).toThrow("workspace");
  });

  it("creates, toggles, and removes workspace items without changing their siblings", () => {
    const previous = freezeDeep(createDemoData(now));
    const added = applyDemoAction(previous, { type: "create_task", title: "  Bread  ", assignee: "maya", dueDate: "2026-10-19", kind: "grocery" }, now);
    const item = added.tasks.at(-1)!;
    expect(item).toMatchObject({ title: "Bread", completed: false, kind: "grocery" });
    const toggled = applyDemoAction(freezeDeep(added), { type: "toggle_task", id: item.id }, now);
    expect(toggled.tasks.at(-1)?.completed).toBe(true);
    expect(added.tasks.at(-1)?.completed).toBe(false);
    const removed = applyDemoAction(toggled, { type: "delete_task", id: item.id }, now);
    expect(removed.tasks).toEqual(previous.tasks);
    expect(() => applyDemoAction(previous, { type: "create_task", title: "Bread", assignee: "maya", dueDate: "2026-02-30", kind: "grocery" }, now)).toThrow("valid due date");
  });

  it("starts an empty personal demo workspace and never pretends to join a real one", () => {
    const previous = freezeDeep(createDemoData(now));
    const next = applyDemoAction(previous, { type: "create_workspace", name: "  Oak House  " }, now);
    expect(next.workspace.name).toBe("Oak House");
    expect(next.workspace.members).toEqual([previous.profile]);
    expect(next.workspace.inviteCode).toMatch(/^DEMO\d{8}$/);
    expect(next.posts).toEqual([]);
    expect(next.tasks).toEqual([]);
    expect(next.expenses).toEqual([]);
    expect(next.events).toEqual([]);
    expect(previous.workspace.members).toHaveLength(4);
    expect(() => applyDemoAction(previous, { type: "join_workspace", code: "MAPLE26" }, now)).toThrow("Demo mode cannot connect");
  });
});
