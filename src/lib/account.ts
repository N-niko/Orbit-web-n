import { z } from "zod";

// Keep in sync with the database's allowed hall names.
export const RESIDENCE_HALLS = ["Mother Joseph Residence Hall", "Dominican Hall", "Rosary Hall"] as const;
export const passwordChecks = [
  { label: "8 or more characters", test: (value: string) => value.length >= 8 },
  { label: "1 uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "1 number", test: (value: string) => /[0-9]/.test(value) },
  { label: "1 special character", test: (value: string) => /[^A-Za-z0-9\s]/.test(value) },
];
export const accountPassword = z.string().min(8, "Use at least 8 characters for your password.").max(128, "Use no more than 128 characters for your password.")
  .refine(value => passwordChecks.every(check => check.test(value)), "Use 8+ characters, an uppercase letter, a number, and a special character.");
export const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name (at least 2 characters).").max(80),
  email: z.email("Enter a valid email address.").trim().max(254),
  password: accountPassword,
  major: z.string().trim().min(1, "Enter your major, or Undecided.").max(100),
  graduationYear: z.number().int().min(2000, "Choose a graduation year between 2000 and 2100.").max(2100, "Choose a graduation year between 2000 and 2100."),
}).strict();
export const onboardingSchema = z.object({
  major: z.string().trim().min(1).max(100),
  graduationYear: z.number().int().min(2000).max(2100),
  residency: z.enum(["commuter", "resident"]),
  residenceHall: z.enum(RESIDENCE_HALLS).nullable(),
  avatarPath: z.string().max(200).nullable(),
  complete: z.boolean(),
}).strict().refine(value => value.residency === "resident" ? Boolean(value.residenceHall) : value.residenceHall === null,
  "Choose your residence hall, or select commuter.");

export const AVATAR_BUCKET = "orbit-avatars";
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
