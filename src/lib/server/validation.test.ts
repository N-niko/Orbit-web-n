import { describe, expect, it } from "vitest";
import { hasAllowedOrigin, orbitActionSchema, safeRedirectPath } from "./validation";

const member = "9c8d4c4f-e335-456a-939d-781d10ba1cf4";

describe("server action validation", () => {
  it("rejects forged identity fields and malformed resource IDs", () => {
    expect(orbitActionSchema.safeParse({ type: "create_post", body: "Hello", category: "general", author: member }).success).toBe(false);
    expect(orbitActionSchema.safeParse({ type: "toggle_like", id: "another-workspace" }).success).toBe(false);
  });

  it("validates money precision, ranges, dates, and member IDs", () => {
    const expense = { type: "create_expense", title: "Groceries", paidBy: member };
    expect(orbitActionSchema.safeParse({ ...expense, amount: 0.29 }).success).toBe(true);
    for (const amount of [0, -1, 1.001, 100000.01, Infinity]) {
      expect(orbitActionSchema.safeParse({ ...expense, amount }).success).toBe(false);
    }
    const task = { type: "create_task", title: "Kitchen", assignee: member, kind: "task" };
    expect(orbitActionSchema.safeParse({ ...task, dueDate: "2028-02-29" }).success).toBe(true);
    expect(orbitActionSchema.safeParse({ ...task, dueDate: "2026-02-29" }).success).toBe(false);
    expect(orbitActionSchema.safeParse({ ...task, dueDate: "tomorrow" }).success).toBe(false);
  });

  it("trims content, bounds lengths, and normalizes invite codes", () => {
    expect(orbitActionSchema.parse({ type: "create_post", body: "  Welcome  ", category: "general" })).toMatchObject({ body: "Welcome" });
    expect(orbitActionSchema.safeParse({ type: "create_post", body: " ", category: "general" }).success).toBe(false);
    expect(orbitActionSchema.safeParse({ type: "add_comment", id: member, body: "x".repeat(1001) }).success).toBe(false);
    expect(orbitActionSchema.parse({ type: "join_workspace", code: " abcdef123456 " })).toMatchObject({ code: "ABCDEF123456" });
  });

  it("accepts the event colors used by the form and rejects unexpected values", () => {
    const event = { type: "create_event", title: "Study circle", description: "Bring notes", location: "Library", startsAt: "2026-12-01T15:00:00Z", category: "Academic" };
    for (const cover of ["violet", "peach", "green", "blue"]) {
      expect(orbitActionSchema.safeParse({ ...event, cover }).success).toBe(true);
    }
    expect(orbitActionSchema.safeParse({ ...event, cover: "https://untrusted.example/cover" }).success).toBe(false);
  });
});

describe("cookie-authenticated request protections", () => {
  it("accepts same-origin requests and rejects cross-origin requests", () => {
    const request = (headers: HeadersInit) => new Request("https://orbit.example/api/orbit", { headers });
    expect(hasAllowedOrigin(request({ origin: "https://orbit.example" }))).toBe(true);
    expect(hasAllowedOrigin(request({ origin: "https://attacker.example" }))).toBe(false);
    expect(hasAllowedOrigin(request({ origin: "null" }))).toBe(false);
    expect(hasAllowedOrigin(request({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(hasAllowedOrigin(request({}))).toBe(true);
  });

  it("keeps authentication callback redirects on this application", () => {
    expect(safeRedirectPath("/events?tab=upcoming")).toBe("/events?tab=upcoming");
    for (const value of [null, "https://attacker.example", "//attacker.example", "/\\attacker.example", "/\n/attacker.example", "/\t/attacker.example", "/ \t/attacker.example"]) {
      expect(safeRedirectPath(value)).toBe("/");
    }
  });
});
