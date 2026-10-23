import { describe, expect, it } from "vitest";
import { directoryProfile, peopleQuerySchema, peopleResponseSchema } from "./people-search";

describe("campus people search", () => {
  it("requires a meaningful, bounded name query", () => {
    for (const query of ["", " ", "a", "a".repeat(101)]) expect(peopleQuerySchema.safeParse(query).success).toBe(false);
    expect(peopleQuerySchema.parse("  Other Student  ")).toBe("Other Student");
  });
  it("strips account-only data even if it is accidentally present in a response", () => {
    const person = { id: "30000000-0000-4000-8000-000000000001", name: "Other Student", university: "Caldwell University", major: "", year: "", graduationYear: null, color: "#eeeeee", email: "private@example.invalid", residenceHall: "Rosary Hall", avatarPath: "private/avatar.png", bio: "Workspace bio" };
    const response = peopleResponseSchema.parse({ people: [person] });
    expect(Object.keys(response.people[0]).sort()).toEqual(["color", "graduationYear", "id", "major", "name", "university", "year"]);
    expect(directoryProfile(response.people[0])).toMatchObject({ name: "Other Student", bio: "" });
    expect(directoryProfile(response.people[0])).not.toHaveProperty("email");
    expect(peopleResponseSchema.safeParse({ people: Array(25).fill(person) }).success).toBe(false);
  });
});
