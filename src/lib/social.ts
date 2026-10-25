import { z } from "zod";
import { postAuthorSchema } from "./post-social";
export const peoplePageSchema=z.object({users:z.array(postAuthorSchema).max(50),hasMore:z.boolean()});
export const followStatsSchema=z.object({followerCount:z.number().int().nonnegative(),followingCount:z.number().int().nonnegative(),following:z.boolean()});
export type FollowStats=z.infer<typeof followStatsSchema>;
export type FollowEdge={followerId:string;followedId:string};
export function demoFollowStats(edges:FollowEdge[],viewerId:string,profileId:string):FollowStats{return{followerCount:edges.filter(e=>e.followedId===profileId).length,followingCount:edges.filter(e=>e.followerId===profileId).length,following:edges.some(e=>e.followerId===viewerId&&e.followedId===profileId)};}
export function setUserFollow(edges:FollowEdge[],followerId:string,followedId:string,following:boolean) {
 if(followerId===followedId)throw new Error("You cannot follow yourself.");
 const rest=edges.filter(e=>e.followerId!==followerId||e.followedId!==followedId);
 return following?[...rest,{followerId,followedId}]:rest;
}
