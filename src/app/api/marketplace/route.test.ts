import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),user:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({getSupabaseServerClient:mocks.client}));
import { POST } from "./route";
const request=(body:unknown,origin="https://orbit.example")=>new Request("https://orbit.example/api/marketplace",{method:"POST",headers:{"content-type":"application/json",origin},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();mocks.client.mockResolvedValue({auth:{getUser:mocks.user},rpc:mocks.rpc});mocks.user.mockResolvedValue({data:{user:{id:"student"}},error:null});mocks.rpc.mockResolvedValue({data:{eligible:true,university:"Caldwell University",domain:"caldwell.edu"},error:null});});
describe("Marketplace API",()=>{
 it("requires an authenticated identity and returns private responses",async()=>{
  const response=await POST(request({type:"identity"}));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");expect(mocks.rpc).toHaveBeenCalledWith("orbit_market",{p_action:{type:"identity"}});
  mocks.user.mockResolvedValue({data:{user:null},error:null});expect((await POST(request({type:"identity"}))).status).toBe(401);
 });
 it("blocks cross-site requests and forged ownership",async()=>{
  expect((await POST(request({type:"identity"},"https://other.example"))).status).toBe(403);
  expect((await POST(request({type:"contact",id:crypto.randomUUID(),sellerId:crypto.randomUUID()}))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("preserves database denials and hides database internals",async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code:"42501",message:"secret"}});
  const response=await POST(request({type:"identity"}));expect(response.status).toBe(403);expect(JSON.stringify(await response.json())).not.toContain("secret");
 });
});
