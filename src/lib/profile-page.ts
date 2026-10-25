import { z } from "zod";
import { postStatsSchema } from "./post-social";
import { directoryProfileSchema } from "./people-search";
export const profilePostSchema = z.object({ id: z.uuid(), body: z.string(), category: z.enum(["general", "question", "marketplace"]), createdAt: z.string(), likeCount: z.number().int().nonnegative(), commentCount: z.number().int().nonnegative() }).extend(postStatsSchema.shape);
export const profilePageSchema = z.object({ profile: directoryProfileSchema.extend({ bio: z.string(), avatarUrl: z.string().optional() }), posts: z.array(profilePostSchema).max(20).nullable(), hasMore: z.boolean() });
