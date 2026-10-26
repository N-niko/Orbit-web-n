import { beforeEach,describe,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),user:vi.fn(),rpc:vi.fn(),signed:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({getSupabaseServerClient:mocks.client}));
import { GET } from "./route";
const id="a0000000-0000-4000-8000-000000000001";
beforeEach(()=>{vi.resetAllMocks();mocks.client.mockResolvedValue({auth:{getUser:mocks.user},rpc:mocks.rpc,storage:{from:()=>({createSignedUrls:mocks.signed})}});mocks.user.mockResolvedValue({data:{user:{id}},error:null});mocks.rpc.mockResolvedValue({data:{items:[],nextCursor:null,hasMore:false},error:null});});
describe("global feed API",()=>{
 it("requires a signed-in student",async()=>{mocks.user.mockResolvedValue({data:{user:null},error:null});expect((await GET(new Request("https://orbit.test/api/feed"))).status).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled();});
 it("preserves timestamp precision and derives visibility from the authenticated database session",async()=>{const cursor={publishedAt:"2026-01-01T00:00:00.123456+00:00",id,kind:"post"};const r=await GET(new Request(`https://orbit.test/api/feed?${new URLSearchParams({cursor:JSON.stringify(cursor),viewer:"forged"})}`));expect(r.status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith("orbit_home_feed",{p_before:cursor.publishedAt,p_id:id,p_kind:"post"});expect(r.headers.get("cache-control")).toContain("no-store");});
 it("rejects malformed and oversized cursors without querying",async()=>{for(const cursor of ["invalid",JSON.stringify({id}),"a".repeat(513)])expect((await GET(new Request(`https://orbit.test/api/feed?${new URLSearchParams({cursor})}`))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();});
 it("strips private identity fields and signs only approved avatar paths",async()=>{
 mocks.rpc.mockResolvedValue({data:{items:[{kind:"post",id,publishedAt:"2026-01-01T00:00:00Z",post:{id,author:{id,name:"Alice",color:"#eee",avatarPath:"allowed/photo",email:"private@example.invalid",bio:"Private"},body:"Public",createdAt:"2026-01-01T00:00:00Z",audience:"public",likeCount:0,liked:false,commentCount:0,attachments:[]}}],nextCursor:null,hasMore:false},error:null});
 mocks.signed.mockResolvedValue({data:[{path:"allowed/photo",signedUrl:"https://image.test/approved"}]});const r=await GET(new Request("https://orbit.test/api/feed"));const body=await r.json();expect(body.items[0].post.author).toEqual({id,name:"Alice",color:"#eee",avatarUrl:"https://image.test/approved"});expect(JSON.stringify(body)).not.toContain("avatarPath");
 });
});
