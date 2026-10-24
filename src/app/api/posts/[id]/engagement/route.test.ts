import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({getClient:vi.fn(),getUser:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({getSupabaseServerClient:mocks.getClient}));
import { GET,POST } from "./route";
const id="70000000-0000-4000-8000-000000000001";const context=()=>({params:Promise.resolve({id})});
const request=(body:unknown,origin="https://orbit.example")=>new Request(`https://orbit.example/api/posts/${id}/engagement?club=true`,{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();mocks.getClient.mockResolvedValue({auth:{getUser:mocks.getUser},rpc:mocks.rpc});mocks.getUser.mockResolvedValue({data:{user:{id:"viewer"}},error:null});mocks.rpc.mockResolvedValue({data:{likeCount:1,liked:true,commentCount:0,attachments:[],comments:[],hasMore:false},error:null});});
describe("post responses endpoint",()=>{
 it("blocks anonymous and cross-site writes",async()=>{
  expect((await POST(request({type:"like",liked:true},"https://attacker.example"),context())).status).toBe(403);
  mocks.getUser.mockResolvedValue({data:{user:null},error:null});expect((await POST(request({type:"like",liked:true}),context())).status).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("derives the actor from the session and passes an explicit like choice",async()=>{
  const response=await POST(request({type:"like",liked:true}),context());expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(mocks.rpc).toHaveBeenCalledWith("orbit_post_respond",{p_post:id,p_club:true,p_action:{type:"like",liked:true}});
  expect((await POST(request({type:"like",liked:true,authorId:id}),context())).status).toBe(400);
 });
 it("rejects forged cursors and hides backend internals",async()=>{
  expect((await GET(new Request(`https://orbit.example/api/posts/${id}/engagement?before=forged`),context())).status).toBe(400);
  mocks.rpc.mockResolvedValue({data:null,error:{code:"42501",message:"private internals"}});
  const response=await GET(new Request(`https://orbit.example/api/posts/${id}/engagement`),context());expect(response.status).toBe(403);expect(JSON.stringify(await response.json())).not.toContain("private internals");
 });
});
