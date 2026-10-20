import { describe, expect, it } from "vitest";
import { accountPassword, onboardingSchema, signupSchema } from "./account";

describe("account setup validation", () => {
  it("requires the requested password rules without counting spaces as special characters", () => {
    for (const password of ["short1!", "password1!", "Password!", "Password1 "]) expect(accountPassword.safeParse(password).success).toBe(false);
    expect(accountPassword.safeParse("Password1!").success).toBe(true);
  });
  it("accepts regular email addresses and requires student details", () => {
    const input = { name: "New Student", email: "student@gmail.com", password: "Password1!", major: "Undecided", graduationYear: 2030 };
    expect(signupSchema.safeParse(input).success).toBe(true);
    expect(signupSchema.safeParse({ ...input, major: " " }).success).toBe(false);
    expect(signupSchema.safeParse({ ...input, graduationYear: 1800 }).success).toBe(false);
  });
  it("keeps commuter and resident hall choices consistent and allows skipping a photo", () => {
    const base = { major: "Biology", graduationYear: 2030, avatarPath: null, complete: true };
    expect(onboardingSchema.safeParse({ ...base, residency: "resident", residenceHall: null }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, residency: "resident", residenceHall: "Rosary Hall" }).success).toBe(true);
    expect(onboardingSchema.safeParse({ ...base, residency: "commuter", residenceHall: "Rosary Hall" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, residency: "commuter", residenceHall: null }).success).toBe(true);
  });
});
