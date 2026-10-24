import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({getClient:vi.fn(),getUser:vi.fn(),rpc:vi.fn(),from:vi.fn(),sign:vi.fn(),remove:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({getSupabaseServerClient:mocks.getClient}));
import { GET,DELETE } from "./route";
const id="70000000-0000-4000-8000-000000000001";const context=()=>({params:Promise.resolve({id})});
const file={id,name:"notes.pdf",mime:"application/pdf",size:123,path:`viewer/${id}`,pending:false};
beforeEach(()=>{vi.resetAllMocks();mocks.getClient.mockResolvedValue({auth:{getUser:mocks.getUser},rpc:mocks.rpc,storage:{from:mocks.from}});mocks.getUser.mockResolvedValue({data:{user:{id:"viewer"}},error:null});mocks.rpc.mockResolvedValue({data:file,error:null});mocks.from.mockReturnValue({createSignedUrl:mocks.sign,remove:mocks.remove});mocks.sign.mockResolvedValue({data:{signedUrl:"https://storage.example/signed"},error:null});});
describe("attachment access",()=>{
 it("checks access before issuing a short download URL",async()=>{
  const response=await GET(new Request(`https://orbit.example/api/attachments/${id}`),context());expect(response.status).toBe(302);expect(response.headers.get("Cache-Control")).toContain("no-store");expect(mocks.sign).toHaveBeenCalledWith(file.path,60,{download:"notes.pdf"});
 });
 it("never signs unavailable or unauthorized files",async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code:"P0002"}});expect((await GET(new Request(`https://orbit.example/api/attachments/${id}`),context())).status).toBe(404);expect(mocks.sign).not.toHaveBeenCalled();
 });
 it("does not discard published files or accept cross-site deletes",async()=>{
  expect((await DELETE(new Request(`https://orbit.example/api/attachments/${id}`,{method:"DELETE",headers:{origin:"https://other.example"}}),context())).status).toBe(403);
  expect((await DELETE(new Request(`https://orbit.example/api/attachments/${id}`,{method:"DELETE"}),context())).status).toBe(409);expect(mocks.remove).not.toHaveBeenCalled();
 });
});
