import { z } from "zod";
import { peoplePageSchema } from "@/lib/social";
import { postClient,postError } from "@/lib/server/posts";
import { privateJson } from "@/lib/server/responses";
import { socialAvatars } from "@/lib/server/social-avatars";
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
 const auth=await postClient();if(auth.response)return auth.response;
 const params=new URL(request.url).searchParams;
 const id=z.uuid().safeParse((await context.params).id);const club=z.enum(["true","false"]).safeParse(params.get("club")??"false");const after=z.uuid().nullable().safeParse(params.get("after"));
 if(!id.success||!club.success||!after.success)return privateJson({error:"Invalid post request."},400);
 const {data,error}=await auth.client.rpc("orbit_post_people",{p_post:id.data,p_club:club.data==="true",p_after:after.data});if(error)return postError(error);
 const value=peoplePageSchema.safeParse(await socialAvatars(auth.client,data));return value.success?privateJson(value.data):privateJson({error:"People could not load."},502);
}
