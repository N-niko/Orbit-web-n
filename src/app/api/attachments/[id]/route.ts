import { z } from "zod";
import { fileInfoSchema } from "@/lib/attachments";
import { postClient,postError } from "@/lib/server/posts";
import { privateJson } from "@/lib/server/responses";
import { hasAllowedOrigin } from "@/lib/server/validation";
type Context={ params: Promise<{ id: string }> };
async function fileInfo(client: NonNullable<Awaited<ReturnType<typeof postClient>>["client"]>,id:string) {
 const { data,error }=await client.rpc("orbit_file_info",{ p_id:id });
 if (error) return { response:postError(error) };
 const parsed=fileInfoSchema.safeParse(data);
 return parsed.success ? { file:parsed.data } : { response:privateJson({ error:"File could not load." },502) };
}
export async function GET(request: Request,context:Context) {
 const auth=await postClient(); if (auth.response) return auth.response;
 const id=z.uuid().safeParse((await context.params).id); if (!id.success) return privateJson({ error:"File not found." },404);
 const info=await fileInfo(auth.client,id.data); if (info.response) return info.response;
 const download=new URL(request.url).searchParams.has("download") || !info.file.mime.startsWith("image/");
 const { data,error }=await auth.client.storage.from("orbit-post-files").createSignedUrl(info.file.path,60,download ? { download:info.file.name } : undefined);
 if (error || !data?.signedUrl) return privateJson({ error:"This attachment is unavailable. Try again." },404);
 return new Response(null,{ status:302,headers:{ Location:data.signedUrl,"Cache-Control":"private, no-store, max-age=0",Vary:"Cookie","X-Content-Type-Options":"nosniff" } });
}
export async function DELETE(request: Request,context:Context) {
 if (!hasAllowedOrigin(request)) return privateJson({ error:"Unrecognized origin." },403);
 const auth=await postClient(); if (auth.response) return auth.response;
 const id=z.uuid().safeParse((await context.params).id); if (!id.success) return privateJson({ error:"Invalid attachment." },400);
 const info=await fileInfo(auth.client,id.data); if (info.response) return info.response;
 if (!info.file.pending) return privateJson({ error:"Published attachments cannot be discarded as drafts." },409);
 const { error:storageError }=await auth.client.storage.from("orbit-post-files").remove([info.file.path]);
 if (storageError) return privateJson({ error:"The draft file could not be removed. Try again." },503);
 const { data,error }=await auth.client.rpc("orbit_file_release",{ p_id:id.data });
 return error ? postError(error) : privateJson(data);
}
