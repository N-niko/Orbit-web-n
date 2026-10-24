import { fileMime, reserveFileSchema, reservedFileSchema } from "@/lib/attachments";
import { clubBody } from "@/lib/server/clubs";
import { postClient,postError } from "@/lib/server/posts";
import { privateJson } from "@/lib/server/responses";
export async function POST(request: Request) {
 const auth=await postClient(); if (auth.response) return auth.response;
 const body=await clubBody(request,reserveFileSchema); if (body.response) return body.response;
 // Discard expired, unpublished uploads through Storage's API, never by deleting storage metadata directly.
 const { data:stale }=await auth.client.from("orbit_post_files").select("id,path").is("post_id",null).is("club_post_id",null).lt("created_at",new Date(Date.now()-86400000).toISOString()).limit(50);
 if(stale?.length){
  const { error:cleanupError }=await auth.client.storage.from("orbit-post-files").remove(stale.map(file=>file.path));
  if(!cleanupError)for(const file of stale)await auth.client.rpc("orbit_file_release",{p_id:file.id});
 }
 const { id,name,size }=body.value;
 const { data,error }=await auth.client.rpc("orbit_file_reserve",{ p_id:id,p_name:name,p_mime:fileMime(name),p_size:size });
 if (error) return postError(error);
 const parsed=reservedFileSchema.safeParse(data);
 return parsed.success ? privateJson(parsed.data) : privateJson({ error:"The attachment could not be prepared." },502);
}
