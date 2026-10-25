import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),user:vi.fn(),rpc:vi.fn(),signed:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({getSupabaseServerClient:mocks.client}));
import { GET } from "./route";
const id="a0000000-0000-4000-8000-000000000001";const context={params:Promise.resolve({id})};
beforeEach(()=>{vi.resetAllMocks();mocks.client.mockResolvedValue({auth:{getUser:mocks.user},rpc:mocks.rpc,storage:{from:()=>({createSignedUrls:mocks.signed})}});mocks.user.mockResolvedValue({data:{user:{id}},error:null});mocks.rpc.mockResolvedValue({data:{users:[],hasMore:false},error:null});});
describe("post liker lists",()=>{
 it("requires authentication and passes only the post, club scope, and cursor",async()=>{
  expect((await GET(new Request(`https://orbit.test/api/posts/${id}/likes?club=true`),context)).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("orbit_post_people",{p_post:id,p_club:true,p_after:null});
  mocks.user.mockResolvedValue({data:{user:null},error:null});expect((await GET(new Request('https://orbit.test/'),context)).status).toBe(401);
 });
 it("returns approved avatar URLs and strips paths and private account fields",async()=>{
  mocks.rpc.mockResolvedValue({data:{users:[{id,name:"Alice",color:"#eee",avatarPath:"approved/photo.jpg",email:"private@example.test",residenceHall:"Private"}],hasMore:false},error:null});
  mocks.signed.mockResolvedValue({data:[{path:"approved/photo.jpg",signedUrl:"https://images.test/signed"}]});
  const response=await GET(new Request('https://orbit.test/'),context);const body=await response.json();expect(body.users[0]).toEqual({id,name:"Alice",color:"#eee",avatarUrl:"https://images.test/signed"});expect(response.headers.get('cache-control')).toContain('no-store');
 });
 it("rejects invalid cursors and preserves backend visibility denials",async()=>{
  expect((await GET(new Request('https://orbit.test/?after=invalid'),context)).status).toBe(400);
  mocks.rpc.mockResolvedValue({data:null,error:{code:"42501",message:"private internals"}});const response=await GET(new Request('https://orbit.test/'),context);expect(response.status).toBe(403);expect(JSON.stringify(await response.json())).not.toContain('private internals');
 });
});
