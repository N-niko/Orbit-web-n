import { describe,expect,it } from "vitest";
import { applyPostResponse,postResponseSchema,threadFromPost } from "./post-social";
import { maxFileSize,reserveFileSchema } from "./attachments";
import { orbitActionSchema } from "./server/validation";
const id="70000000-0000-4000-8000-000000000001";
describe("post responses",()=>{
 it("sets likes and retries comments without duplication",()=>{
  const user={id,name:"Alice",color:"#eee"};const initial={likes:[],comments:[]};
  const liked=applyPostResponse(applyPostResponse(initial,user,{type:"like",liked:true}),user,{type:"like",liked:true});
  expect(liked.likes).toEqual([id]);expect(initial.likes).toEqual([]);
  const replied=applyPostResponse(liked,user,{type:"comment",id,body:" Hello "});
  const retry=applyPostResponse(replied,user,{type:"comment",id,body:" Hello "});
  expect(retry.comments).toHaveLength(1);expect(threadFromPost(retry,id)).toMatchObject({liked:true,likeCount:1,commentCount:1});
 });
 it("projects comment authors without account fields",()=>{
  const user={id,name:"Alice",color:"#eee",email:"private@example.invalid",residenceHall:"Private hall"};
  const value=threadFromPost({likes:[],comments:[{id,author:user,body:"Hi",createdAt:new Date().toISOString()}]},id);
  expect(value.comments[0].author).toEqual({id,name:"Alice",color:"#eee"});
 });
 it("rejects forged identities and invalid responses",()=>{
  expect(postResponseSchema.safeParse({type:"like",liked:true,profileId:id}).success).toBe(false);
  expect(postResponseSchema.safeParse({type:"comment",id,body:" "}).success).toBe(false);
  expect(postResponseSchema.safeParse({type:"comment",id,body:"x".repeat(1001)}).success).toBe(false);
 });
});
describe("attachments",()=>{
 it("accepts photos/documents within limits and rejects active content and path names",()=>{
  expect(reserveFileSchema.safeParse({id,name:"Study notes.PDF",size:maxFileSize}).success).toBe(true);
  for(const name of ["test.svg","test.html","run.exe","../notes.pdf","folder\\notes.pdf"])
   expect(reserveFileSchema.safeParse({id,name,size:100}).success).toBe(false);
  expect(reserveFileSchema.safeParse({id,name:"photo.jpg",size:maxFileSize+1}).success).toBe(false);
 });
 it("allows file-only posts but requires text or at least one file",()=>{
  expect(orbitActionSchema.safeParse({type:"create_post",id,body:"",category:"general",attachmentIds:[id]}).success).toBe(true);
  expect(orbitActionSchema.safeParse({type:"create_post",body:"",category:"general"}).success).toBe(false);
  expect(orbitActionSchema.safeParse({type:"create_post",body:"Text",category:"general",attachmentIds:Array(5).fill(id)}).success).toBe(false);
 });
});
