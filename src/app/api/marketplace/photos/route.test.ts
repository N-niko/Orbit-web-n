import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),user:vi.fn(),rpc:vi.fn(),from:vi.fn(),select:vi.fn(),is:vi.fn(),lt:vi.fn(),limit:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({getSupabaseServerClient:mocks.client}));
import { POST } from "./route";
const id="90000000-0000-4000-8000-000000000011";
const request=(body:unknown,origin="https://orbit.example")=>new Request("https://orbit.example/api/marketplace/photos",{method:"POST",headers:{"content-type":"application/json",origin},body:JSON.stringify(body)});
beforeEach(()=>{
 vi.resetAllMocks();const query={select:mocks.select,is:mocks.is,lt:mocks.lt,limit:mocks.limit};mocks.from.mockReturnValue(query);mocks.select.mockReturnValue(query);mocks.is.mockReturnValue(query);mocks.lt.mockReturnValue(query);mocks.limit.mockResolvedValue({data:[]});
 mocks.client.mockResolvedValue({auth:{getUser:mocks.user},rpc:mocks.rpc,from:mocks.from});mocks.user.mockResolvedValue({data:{user:{id:"student"}},error:null});
 mocks.rpc.mockResolvedValue({data:{id,name:"Book.PNG",size:100,mime:"image/png",path:`student/${id}`},error:null});
});
describe("Marketplace photo uploads",()=>{
 it("derives image type on the server and never accepts owner or campus claims",async()=>{
  expect((await POST(request({id,name:"Book.PNG",size:100}))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("orbit_market_photo",{p_action:{type:"reserve",id,name:"Book.PNG",size:100,mime:"image/png"}});
 });
 it("rejects documents, SVG, oversized photos, forged metadata, and cross-site uploads",async()=>{
  for(const body of [{id,name:"notes.pdf",size:100},{id,name:"book.svg",size:100},{id,name:"book.png",size:5242881},{id,name:"book.png",size:100,ownerId:id},{id,name:"book.png",size:100,mime:"image/png"}])expect((await POST(request(body))).status).toBe(400);
  expect((await POST(request({id,name:"book.png",size:100},"https://other.example"))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
