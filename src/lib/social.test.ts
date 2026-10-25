import { describe,expect,it } from "vitest";
import { applyPostResponse,commentThreads,mergePostThread,postResponseSchema,threadFromPost,type PostThread } from "./post-social";
import { demoFollowStats,setUserFollow } from "./social";
const user={id:"a",name:"Alex",color:"#eee"};
describe("comment conversations",()=>{
 it("likes and unlikes comments idempotently without changing the post like",()=>{
  const post={likes:["other"],comments:[{id:"root",author:user,body:"Hello",createdAt:"2026-10-25T12:00:00Z"}]};
  let next=applyPostResponse(post,user,{type:"comment_like",id:"root",liked:true});
  next=applyPostResponse(next,user,{type:"comment_like",id:"root",liked:true});
  expect(threadFromPost(next,"a").comments[0]).toMatchObject({likeCount:1,liked:true});expect(next.likes).toEqual(["other"]);
  next=applyPostResponse(next,user,{type:"comment_like",id:"root",liked:false});expect(threadFromPost(next,"a").comments[0].likeCount).toBe(0);expect(threadFromPost(post,"a").comments[0].likeCount).toBe(0);
 });
 it("keeps replies to replies one visual level deep and rejects missing targets",()=>{
  const post={likes:[],comments:[{id:"root",author:user,body:"Hello",createdAt:"2026-10-25T12:00:00Z"}]};
  const first=applyPostResponse(post,user,{type:"comment",id:"reply",body:"First reply",replyToId:"root"});
  const second=applyPostResponse(first,user,{type:"comment",id:"reply2",body:"Reply again",replyToId:"reply"});
  const groups=commentThreads(threadFromPost(second,"a"));expect(groups).toHaveLength(1);expect(groups[0].replies.map(c=>c.parentId)).toEqual(["root","root"]);
  expect(()=>applyPostResponse(post,user,{type:"comment",id:"bad",body:"Test",replyToId:"missing"})).toThrow();
 });
 it("uses parent context from outside the current page and preserves older comment likes",()=>{
  const root={id:"root",author:user,body:"Older root",createdAt:"2026-10-25T11:00:00Z",likeCount:0};
  const reply={id:"reply",author:user,body:"New reply",createdAt:"2026-10-25T12:00:00Z",parentId:"root"};
  const incoming:PostThread={likeCount:0,liked:false,commentCount:2,attachments:[],comments:[reply],parents:[root],hasMore:true};
  expect(commentThreads(incoming)[0]).toMatchObject({root,replies:[reply]});
  const loaded={...incoming,comments:[root,reply],parents:[],hasMore:false};
  const merged=mergePostThread(loaded,{...incoming,updatedComment:{...root,likeCount:1,liked:true}},"respond");
  expect(merged.comments).toHaveLength(2);expect(merged.comments[0].likeCount).toBe(1);expect(merged.hasMore).toBe(false);expect(merged.parents).toEqual([]);
  expect(mergePostThread(loaded,{...incoming,parents:[{...root,likeCount:3}]},"refresh").comments[0].likeCount).toBe(3);
 });
 it("rejects forged actors and malformed reply targets",()=>{
  const id="a0000000-0000-4000-8000-000000000001";
  expect(postResponseSchema.safeParse({type:"comment",id,body:"Reply",replyToId:"invalid"}).success).toBe(false);
  expect(postResponseSchema.safeParse({type:"comment_like",id,liked:true,profileId:id}).success).toBe(false);
 });
});
describe("basic user follows",()=>{
 it("supports one-way follows, counts, repeated choices, and unfollow",()=>{
  const original=[{followerId:"b",followedId:"a"}];const next=setUserFollow(setUserFollow(original,"a","b",true),"a","b",true);
  expect(demoFollowStats(next,"a","b")).toEqual({following:true,followerCount:1,followingCount:1});expect(original).toHaveLength(1);
  expect(setUserFollow(next,"a","b",false)).toEqual(original);expect(demoFollowStats([],"b","a").following).toBe(false);
  expect(()=>setUserFollow([],"a","a",true)).toThrow();
 });
});
