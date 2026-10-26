import { z } from "zod";
import { postAuthorSchema,postStatsSchema } from "./post-social";
import type { CampusEvent,OrbitData } from "./types";
import type { FollowEdge } from "./social";
import { threadFromPost } from "./post-social";
export const feedCursorSchema=z.object({publishedAt:z.string().datetime({offset:true}),id:z.uuid(),kind:z.enum(["post","event"])}).strict();
export const feedPostSchema=postStatsSchema.extend({id:z.string(),author:postAuthorSchema,body:z.string(),createdAt:z.string(),audience:z.enum(["legacy","public","followers"])});
export const campusEventSchema=z.object({id:z.string(),title:z.string(),description:z.string(),location:z.string(),startsAt:z.string(),endsAt:z.string().nullable().optional(),createdAt:z.string().optional(),category:z.enum(["Social","Academic","Clubs","Wellness"]),cover:z.string(),attendees:z.array(z.string()),host:z.string(),hostName:z.string().optional(),clubId:z.string().nullable().optional(),clubName:z.string().nullable().optional(),clubColor:z.string().nullable().optional(),audience:z.enum(["workspace","public","club"]).optional(),followingHost:z.boolean().optional(),attendeeCount:z.number().optional(),response:z.enum(["going","not_going"]).nullable().optional(),removed:z.boolean().optional()});
export const feedItemSchema=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("post"),id:z.string(),publishedAt:z.string(),post:feedPostSchema}),
 z.object({kind:z.literal("event"),id:z.string(),publishedAt:z.string(),event:campusEventSchema}),
]);
export const feedPageSchema=z.object({items:z.array(feedItemSchema).max(8),nextCursor:feedCursorSchema.nullable(),hasMore:z.boolean()});
export type FeedItem=z.infer<typeof feedItemSchema>;
export type FeedPage=z.infer<typeof feedPageSchema>;
export function mergeFeed(current:FeedItem[],incoming:FeedItem[]) {
 return [...new Map([...current,...incoming].map(item=>[`${item.kind}:${item.id}`,item])).values()].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)||b.id.localeCompare(a.id)||b.kind.localeCompare(a.kind));
}
export function demoFeed(data:OrbitData,edges:FollowEdge[]):FeedItem[] {
 const followed=(id:string)=>edges.some(e=>e.followerId===data.profile.id&&e.followedId===id);
 return mergeFeed([], [
 ...data.posts.filter(p=>p.author.id===data.profile.id||p.audience!=="followers"||followed(p.author.id)).map(post=>({kind:"post" as const,id:post.id,publishedAt:post.createdAt,post:{...post,audience:post.audience??"legacy",...threadFromPost(post,data.profile.id,data.workspace.members)}})),
 ...data.events.filter(e=>e.clubId&&!e.removed).map(event=>({kind:"event" as const,id:event.id,publishedAt:event.createdAt??event.startsAt,event})),
 ]);
}
