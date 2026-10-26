import { feedCursorSchema,feedPageSchema } from "@/lib/feed";
import { postClient,postError } from "@/lib/server/posts";
import { privateJson } from "@/lib/server/responses";
import { socialAvatars } from "@/lib/server/social-avatars";
export async function GET(request:Request) {
 const auth=await postClient();if(auth.response)return auth.response;
 let cursor:ReturnType<typeof feedCursorSchema.parse>|null=null;
 const value=new URL(request.url).searchParams.get("cursor");
 if(value!==null){try{if(value.length>512)throw new Error();cursor=feedCursorSchema.parse(JSON.parse(value));}catch{return privateJson({error:"Invalid feed cursor."},400);}}
 const {data,error}=await auth.client.rpc("orbit_home_feed",{p_before:cursor?.publishedAt??null,p_id:cursor?.id??null,p_kind:cursor?.kind??null});
 if(error)return postError(error);
 const parsed=feedPageSchema.safeParse(await socialAvatars(auth.client,data));
 return parsed.success?privateJson(parsed.data):privateJson({error:"The feed could not load."},502);
}
