import { beforeEach,describe,it,expect,vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanupPostFiles,withPostCleanup } from "./post-cleanup";
const id="c0000000-0000-4000-8000-000000000011",path=`c0000000-0000-4000-8000-000000000001/${id}`;
const rpc=vi.fn(),remove=vi.fn();const client={rpc,storage:{from:vi.fn(()=>({remove}))}} as unknown as SupabaseClient;
beforeEach(()=>{vi.resetAllMocks();rpc.mockResolvedValueOnce({data:{files:[{id,path}]},error:null}).mockResolvedValue({data:{pending:false},error:null});remove.mockResolvedValue({data:[],error:null});});
describe("durable post file cleanup",()=>{
 it("uses Storage API removal before acknowledging only the approved file IDs",async()=>{expect(await cleanupPostFiles(client)).toBe(false);expect(remove).toHaveBeenCalledWith([path]);expect(rpc).toHaveBeenLastCalledWith("orbit_post_cleanup_done",{p_ids:[id]});expect(remove.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[1]);});
 it("keeps jobs pending and never acknowledges a failed Storage deletion",async()=>{remove.mockResolvedValue({error:{message:"offline"}});expect(await cleanupPostFiles(client)).toBe(true);expect(rpc).toHaveBeenCalledTimes(1);});
 it("retains pending jobs when Storage only removes part of a batch",async()=>{rpc.mockReset().mockResolvedValueOnce({data:{files:[{id,path}]}}).mockResolvedValueOnce({data:{pending:true}});expect(await cleanupPostFiles(client)).toBe(true);});
 it("tolerates lost acknowledgements and retries already absent Storage objects",async()=>{rpc.mockReset().mockResolvedValueOnce({data:{files:[{id,path}]}}).mockResolvedValueOnce({error:{message:"lost ack"}});expect(await cleanupPostFiles(client)).toBe(true);});
 it("does not issue arbitrary or malformed paths to Storage",async()=>{rpc.mockReset().mockResolvedValue({data:{files:[{id,path:"other-bucket/../../file"}]}});expect(await cleanupPostFiles(client)).toBe(true);expect(remove).not.toHaveBeenCalled();});
 it("leaves normal snapshots alone and handles offline cleanup without failing the page",async()=>{const data={postFileCleanupPending:false};expect(await withPostCleanup(client,data)).toBe(data);expect(rpc).not.toHaveBeenCalled();rpc.mockReset().mockRejectedValue(new Error("offline"));expect(await withPostCleanup(client,{postFileCleanupPending:true})).toEqual({postFileCleanupPending:true});});
});
