import { z } from "zod";
import { followStatsSchema,peoplePageSchema } from "@/lib/social";
import { clubBody } from "@/lib/server/clubs";
import { postClient,postError } from "@/lib/server/posts";
import { privateJson } from "@/lib/server/responses";
import { socialAvatars } from "@/lib/server/social-avatars";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {
 const auth=await postClient();if(auth.response)return auth.response;
 const params=new URL(request.url).searchParams;const id=z.uuid().safeParse((await context.params).id);
 const kind=z.enum(["stats","followers","following"]).safeParse(params.get("kind")??"stats");const after=z.uuid().nullable().safeParse(params.get("after"));
 if(!id.success||!kind.success||!after.success)return privateJson({error:"Invalid profile request."},400);
 const {data,error}=await auth.client.rpc("orbit_profile_social",{p_profile:id.data,p_kind:kind.data,p_after:after.data});if(error)return postError(error);
 const value=(kind.data==="stats"?followStatsSchema:peoplePageSchema).safeParse(await socialAvatars(auth.client,data));return value.success?privateJson(value.data):privateJson({error:"Connections could not load."},502);
}
export async function POST(request:Request,context:Context) {
 const auth=await postClient();if(auth.response)return auth.response;
 const id=z.uuid().safeParse((await context.params).id);if(!id.success)return privateJson({error:"Invalid profile."},400);
 const body=await clubBody(request,z.object({following:z.boolean()}).strict());if(body.response)return body.response;
 const {data,error}=await auth.client.rpc("orbit_profile_social",{p_profile:id.data,p_following:body.value.following});if(error)return postError(error);
 const value=followStatsSchema.safeParse(data);return value.success?privateJson(value.data):privateJson({error:"Following could not update."},502);
}
