import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({getClient:vi.fn(),getUser:vi.fn(),rpc:vi.fn(),from:vi.fn(),select:vi.fn(),is:vi.fn(),lt:vi.fn(),limit:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({getSupabaseServerClient:mocks.getClient}));
import { POST } from "./route";
const id="70000000-0000-4000-8000-000000000001";
const request=(value:unknown,origin="https://orbit.example")=>new Request("https://orbit.example/api/attachments",{method:"POST",headers:{"Content-Type":"application/json",origin},body:JSON.stringify(value)});
beforeEach(()=>{
 vi.resetAllMocks();const query={select:mocks.select,is:mocks.is,lt:mocks.lt,limit:mocks.limit};mocks.from.mockReturnValue(query);mocks.select.mockReturnValue(query);mocks.is.mockReturnValue(query);mocks.lt.mockReturnValue(query);mocks.limit.mockResolvedValue({data:[],error:null});
 mocks.getClient.mockResolvedValue({auth:{getUser:mocks.getUser},rpc:mocks.rpc,from:mocks.from});mocks.getUser.mockResolvedValue({data:{user:{id:"viewer"}},error:null});
 mocks.rpc.mockResolvedValue({data:{id,name:"Notes.PDF",mime:"application/pdf",size:100,path:`viewer/${id}`},error:null});
});
describe("file reservations",()=>{
 it("selects the file type on the server and sends no caller-controlled owner",async()=>{
  expect((await POST(request({id,name:"Notes.PDF",size:100}))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("orbit_file_reserve",{p_id:id,p_name:"Notes.PDF",p_size:100,p_mime:"application/pdf"});
 });
 it("blocks forged metadata, unsafe types, and cross-site reservations",async()=>{
  for(const body of [{id,name:"bad.html",size:100},{id,name:"notes.pdf",size:100,ownerId:id},{id,name:"notes.pdf",size:100,mime:"text/html"}])expect((await POST(request(body))).status).toBe(400);
  expect((await POST(request({id,name:"notes.pdf",size:100},"https://other.example"))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
