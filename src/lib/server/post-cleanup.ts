import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
const cleanupBatch=z.object({files:z.array(z.object({id:z.uuid(),path:z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/)})).max(16)});
/** Jobs survive failures and are acknowledged only after Storage confirms the objects are gone. */
export async function cleanupPostFiles(client:SupabaseClient):Promise<boolean> {
 try {
  const {data,error}=await client.rpc("orbit_post_cleanup_files");if(error)return true;
  const parsed=cleanupBatch.safeParse(data);if(!parsed.success)return true;
  if(!parsed.data.files.length)return false;
  const files=parsed.data.files;
  const removed=await client.storage.from("orbit-post-files").remove(files.map(file=>file.path));if(removed.error)return true;
  const done=await client.rpc("orbit_post_cleanup_done",{p_ids:files.map(file=>file.id)});
  const result=z.object({pending:z.boolean()}).safeParse(done.data);
  return Boolean(done.error)||!result.success||result.data.pending;
 }catch{return true;}
}
export async function withPostCleanup<T extends {postFileCleanupPending?:boolean}>(client:SupabaseClient,data:T):Promise<T> {
 if(data.postFileCleanupPending)data.postFileCleanupPending=await cleanupPostFiles(client);
 return data;
}
