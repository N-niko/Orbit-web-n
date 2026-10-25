import { z } from "zod";
import { postResponseSchema, postThreadSchema } from "@/lib/post-social";
import { clubBody } from "@/lib/server/clubs";
import { postClient, postError } from "@/lib/server/posts";
import { privateJson } from "@/lib/server/responses";
import { socialAvatars } from "@/lib/server/social-avatars";
type Context = { params: Promise<{ id: string }> };
async function target(request: Request, context: Context) {
 const id=z.uuid().safeParse((await context.params).id);
 const club=z.enum(["true","false"]).safeParse(new URL(request.url).searchParams.get("club") ?? "false");
 const before=z.uuid().nullable().safeParse(new URL(request.url).searchParams.get("before"));
 return id.success && club.success && before.success ? { p_post:id.data,p_club:club.data==="true",p_before:before.data } : null;
}
export async function GET(request: Request, context: Context) {
 const auth=await postClient(); if (auth.response) return auth.response;
 const args=await target(request,context); if (!args) return privateJson({ error:"Invalid post request." },400);
 const { data,error }=await auth.client.rpc("orbit_post_thread",args); if (error) return postError(error);
 const parsed=postThreadSchema.safeParse(await socialAvatars(auth.client,data));
 return parsed.success ? privateJson(parsed.data) : privateJson({ error:"Comments could not load." },502);
}
export async function POST(request: Request, context: Context) {
 const auth=await postClient(); if (auth.response) return auth.response;
 const args=await target(request,context); if (!args) return privateJson({ error:"Invalid post request." },400);
 const body=await clubBody(request,postResponseSchema); if (body.response) return body.response;
 const { data,error }=await auth.client.rpc("orbit_post_respond",{ p_post:args.p_post,p_club:args.p_club,p_action:body.value });
 if (error) return postError(error);
 const parsed=postThreadSchema.safeParse(await socialAvatars(auth.client,data));
 return parsed.success ? privateJson(parsed.data) : privateJson({ error:"Your response could not load. Try again." },502);
}
