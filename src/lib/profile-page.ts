import { z } from "zod";
import { directoryProfileSchema } from "./people-search";
export const profilePostSchema = z.object({ id: z.uuid(), body: z.string(), category: z.enum(["general", "question", "marketplace"]), createdAt: z.string(), likeCount: z.number().int().nonnegative(), commentCount: z.number().int().nonnegative() });
export const profilePageSchema = z.object({ profile: directoryProfileSchema.extend({ bio: z.string() }), posts: z.array(profilePostSchema).max(20).nullable(), hasMore: z.boolean() });
