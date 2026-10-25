import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),user:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({getSupabaseServerClient:mocks.client}));
import { GET,POST } from "./route";
const id="a0000000-0000-4000-8000-000000000001";const context={params:Promise.resolve({id})};
const request=(body:unknown,origin='https://orbit.test')=>new Request('https://orbit.test/api/profiles/'+id+'/social',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();mocks.client.mockResolvedValue({auth:{getUser:mocks.user},rpc:mocks.rpc});mocks.user.mockResolvedValue({data:{user:{id}},error:null});mocks.rpc.mockResolvedValue({data:{following:true,followerCount:1,followingCount:0},error:null});});
describe("profile follows",()=>{
 it("sends an explicit choice without accepting a caller-provided follower identity",async()=>{
  expect((await POST(request({following:true}),context)).status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('orbit_profile_social',{p_profile:id,p_following:true});
  expect((await POST(request({following:true,followerId:id}),context)).status).toBe(400);
 });
 it("blocks unsigned and cross-site requests and sanitizes backend errors",async()=>{
  expect((await POST(request({following:true},'https://elsewhere.test'),context)).status).toBe(403);
  mocks.user.mockResolvedValue({data:{user:null},error:null});expect((await GET(new Request('https://orbit.test'),context)).status).toBe(401);
  mocks.user.mockResolvedValue({data:{user:{id}},error:null});mocks.rpc.mockResolvedValue({data:null,error:{code:'22023',message:'private internal value'}});const response=await POST(request({following:true}),context);expect(response.status).toBe(400);expect(JSON.stringify(await response.json())).not.toContain('private internal value');
 });
 it("validates list scope and pagination while keeping responses private",async()=>{
  expect((await GET(new Request('https://orbit.test/?kind=private'),context)).status).toBe(400);
  mocks.rpc.mockResolvedValue({data:{users:[],hasMore:false},error:null});const response=await GET(new Request('https://orbit.test/?kind=followers'),context);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');
 });
});
