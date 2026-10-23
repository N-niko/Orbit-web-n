import { describe, expect, it } from "vitest";
import { createDemoClubs, createClubSchema, filterClubs, mergeClubMessages, sendClubMessageSchema, setDemoFollow } from "./clubs";

describe("clubs and chat", () => {
  it("filters clubs by words, category, and the current user's follows", () => {
    const original = createDemoClubs();
    const followed = setDemoFollow(original, "code-and-coffee", true);
    expect(filterClubs(followed.clubs, "coffee code", "Technology & learning", true).map(club => club.id)).toEqual(["code-and-coffee"]);
    expect(filterClubs(followed.clubs, "", "Academic")).toEqual([]);
    expect(original.clubs.every(club => !club.following)).toBe(true);
    expect(setDemoFollow(followed, "code-and-coffee", true).clubs.find(club => club.id === "code-and-coffee")?.followerCount).toBe(2);
    expect(setDemoFollow(followed, "code-and-coffee", false).clubs.find(club => club.id === "code-and-coffee")?.followerCount).toBe(1);
  });
  it("merges retries, history pages and polling without duplicate messages", () => {
    const author = { id: "alice", name: "Alice", color: "violet" };
    const early = { id: "a", body: "First", createdAt: "2026-10-22T10:00:00Z", author };
    const late = { id: "b", body: "Second", createdAt: "2026-10-22T11:00:00Z", author };
    expect(mergeClubMessages([late], [early, late])).toEqual([early, late]);
    expect(mergeClubMessages([early], [{ ...early, body: "Server version" }])).toHaveLength(1);
  });
  it("rejects forged identity, whitespace-only messages, and oversized content", () => {
    const id = "50000000-0000-4000-8000-000000000010";
    expect(sendClubMessageSchema.parse({ id, body: "  Hello  " }).body).toBe("Hello");
    expect(sendClubMessageSchema.safeParse({ id, body: "Hello", author: "someone else" }).success).toBe(false);
    expect(sendClubMessageSchema.safeParse({ id, body: " " }).success).toBe(false);
    expect(sendClubMessageSchema.safeParse({ id, body: "x".repeat(2001) }).success).toBe(false);
    expect(createClubSchema.safeParse({ id, name: "Club", description: "Hi", category: "Other", meeting: "", color: "green", createdBy: "someone else" }).success).toBe(false);
  });
});
