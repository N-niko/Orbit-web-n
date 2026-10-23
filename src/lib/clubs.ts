import { z } from "zod";
import { demoClubs } from "./discovery";

export const clubCategories = ["Academic", "Arts & creativity", "Technology & learning", "Sports & wellness", "Culture & community", "Service", "Other"] as const;
export const clubColors = ["violet", "peach", "green", "blue"] as const;
export const createClubSchema = z.object({
  id: z.uuid(), name: z.string().trim().min(2).max(80), description: z.string().trim().min(1).max(2000),
  category: z.enum(clubCategories), meeting: z.string().trim().max(240), color: z.enum(clubColors),
}).strict();
export const followClubSchema = z.object({ following: z.boolean() }).strict();
export const sendClubMessageSchema = z.object({ id: z.uuid(), body: z.string().trim().min(1).max(2000) }).strict();
export const clubSchema = createClubSchema.omit({ id: true }).extend({
  id: z.string(), createdBy: z.string(), createdAt: z.string(), followerCount: z.number().int().nonnegative(), following: z.boolean(),
});
export const clubListSchema = z.object({ clubs: z.array(clubSchema).max(100) });
export const clubMessageSchema = z.object({ id: z.string(), body: z.string(), createdAt: z.string(), author: z.object({ id: z.string(), name: z.string(), color: z.string() }) });
export const clubMessagesSchema = z.object({ messages: z.array(clubMessageSchema).max(50), hasMore: z.boolean() });
export type Club = z.infer<typeof clubSchema>;
export type ClubMessage = z.infer<typeof clubMessageSchema>;
export type CreateClub = z.infer<typeof createClubSchema>;
export type DemoClubs = { clubs: Club[]; messages: Record<string, ClubMessage[]> };

export function createDemoClubs(): DemoClubs {
  return { clubs: demoClubs.map(club => ({ ...club, category: clubCategories.includes(club.category as typeof clubCategories[number]) ? club.category as typeof clubCategories[number] : "Other",
    color: club.color as typeof clubColors[number], createdBy: "maya", createdAt: "2026-10-01T12:00:00Z", followerCount: 1, following: false })),
    messages: Object.fromEntries(demoClubs.map(club => [club.id, [{ id: `${club.id}-welcome`, body: `Welcome to ${club.name}! What would you like to do together?`, createdAt: "2026-10-22T12:00:00Z", author: { id: "maya", name: "Maya Patel", color: "#f6e5dc" } }]])) };
}

export function filterClubs(clubs: Club[], query: string, category = "", following = false) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return clubs.filter(club => (!category || club.category === category) && (!following || club.following)
    && words.every(word => `${club.name} ${club.description} ${club.category}`.toLocaleLowerCase().includes(word)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Merge polling and history pages without duplicate messages or unstable ordering. */
export function mergeClubMessages(current: ClubMessage[], incoming: ClubMessage[]) {
  return [...new Map([...current, ...incoming].map(message => [message.id, message])).values()]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));
}

export function setDemoFollow(data: DemoClubs, id: string, following: boolean): DemoClubs {
  return { ...data, clubs: data.clubs.map(club => club.id === id ? { ...club, following,
    followerCount: club.followerCount + Number(following) - Number(club.following) } : club) };
}
