import { z } from "zod";
import type { Profile } from "./types";

// Campus discovery deliberately excludes email, housing, photos, and workspace data.
export const directoryProfileSchema = z.object({
  id: z.uuid(), name: z.string(), university: z.string(), major: z.string(),
  year: z.string(), graduationYear: z.number().int().nullable(), color: z.string(),
}).strip();
export type DirectoryProfile = z.infer<typeof directoryProfileSchema>;
export const peopleQuerySchema = z.string().trim().min(2, "Enter at least 2 characters.").max(100, "Use no more than 100 characters.");
export const peopleResponseSchema = z.object({ people: z.array(directoryProfileSchema).max(24) });

export function directoryProfile(profile: DirectoryProfile): Profile {
  return { ...directoryProfileSchema.parse(profile), bio: "" };
}
