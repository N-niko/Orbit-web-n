import { describe, expect, it } from "vitest";
import { createDemoData, applyDemoAction } from "./demo";
import { buildDirectory, defaultVisibility, searchDirectory, visibleClubMembers, withDirectoryPeople } from "./discovery";

describe("Orbit discovery", () => {
  it("finds a campus profile outside the workspace without adding workspace or account-only data", () => {
    const local = buildDirectory(createDemoData(), false);
    const student = { id: "30000000-0000-4000-8000-000000000001", name: "Other Student", university: "Caldwell University", major: "Physics", year: "", graduationYear: 2030, color: "#eeeeee" };
    const directory = withDirectoryPeople(local, [student, student]);
    expect(searchDirectory(directory, "other student")).toEqual([{ type: "person", id: student.id, title: student.name, subtitle: "Physics" }]);
    expect(directory.people.filter(person => person.profile.id === student.id)).toHaveLength(1);
    expect(directory.people.find(person => person.profile.id === student.id)).toMatchObject({ courses: null, clubIds: null, posts: null, profile: { bio: "" } });
    expect(local.people.some(person => person.profile.id === student.id)).toBe(false);
  });
  it("preserves authorized workspace profile details when a campus match has the same ID", () => {
    const directory = buildDirectory(createDemoData(), false);
    const original = directory.people[0];
    const merged = withDirectoryPeople(directory, [{ ...original.profile, name: "Stale directory name", graduationYear: null }]);
    expect(merged.people.find(person => person.profile.id === original.profile.id)).toBe(original);
  });
  it("puts people before clubs before events, including when a club has an exact title match", () => {
    const original = createDemoData();
    const data = applyDemoAction(original, { type: "update_profile", name: "Design Student", major: "Art", year: "Junior", bio: "Hello" });
    const results = searchDirectory(buildDirectory(data, true), "design");
    expect(results.map(result => result.type)).toEqual(["person", "person", "club", "event"]);
    expect(results[0].title).toBe("Design Student");
    expect(results.find(result => result.type === "club")?.title).toBe("Design Collective");
  });
  it("normalizes names and whitespace, supports scope filtering, and returns no results for unmatched text", () => {
    const directory = buildDirectory(createDemoData(), true);
    expect(searchDirectory(directory, "  MÁYA    patel  ")[0]).toMatchObject({ type: "person", id: "maya" });
    expect(searchDirectory(directory, "", "club")).toHaveLength(3);
    expect(searchDirectory(directory, "", "club").every(result => result.type === "club")).toBe(true);
    expect(searchDirectory(directory, "there is no matching person")).toEqual([]);
  });
  it("removes hidden profile details before display and search, including club rosters", () => {
    const data = createDemoData();
    const directory = buildDirectory(data, true, { ...defaultVisibility, major: false, year: false, bio: false, courses: false, clubs: false, posts: false });
    const alex = directory.people.find(person => person.profile.id === "alex")!;
    expect(alex.profile).toMatchObject({ name: "Alex Morgan", major: "", year: "", bio: "", graduationYear: null });
    expect(alex.courses).toBeNull();
    expect(alex.clubIds).toBeNull();
    expect(alex.posts).toBeNull();
    expect(searchDirectory(directory, "Computer Science")).toEqual([]);
    expect(searchDirectory(directory, "Alex")[0].subtitle).toBe("Caldwell University");
    expect(visibleClubMembers(directory.people, "code-and-coffee").map(person => person.profile.id)).not.toContain("alex");
    expect(visibleClubMembers(directory.people, "design-collective").map(person => person.profile.id)).not.toContain("sam");
    expect(data.profile.major).toBe("Computer Science");
    expect(data.posts).toHaveLength(4);
  });
  it("keeps account-only fields out of visitor profiles and uses the latest profile", () => {
    const data = createDemoData();
    data.profile = { ...data.profile, name: "Alex Taylor", residenceHall: "Rosary Hall", residency: "resident", email: "private@example.com" };
    const alex = buildDirectory(data, true).people.find(person => person.profile.id === "alex")!;
    expect(alex.profile.name).toBe("Alex Taylor");
    expect(alex.profile).not.toHaveProperty("email");
    expect(alex.profile).not.toHaveProperty("residenceHall");
    expect(alex.profile).not.toHaveProperty("residency");
    expect(alex.posts?.[0]).not.toHaveProperty("author");
  });
  it("does not mix fictional clubs or courses into signed-in workspace results", () => {
    const directory = buildDirectory(createDemoData(), false);
    expect(directory.clubs).toEqual([]);
    expect(directory.people.every(person => person.courses === null && person.clubIds === null)).toBe(true);
    expect(searchDirectory(directory, "", "event")).toHaveLength(3);
  });
});
