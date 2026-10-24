import { getSupabaseServerClient } from "@/lib/supabase/server";
import { databaseError, privateJson } from "./responses";
export async function postClient() {
 const client=await getSupabaseServerClient();
 if (!client) return { response: privateJson({ error: "Posts are temporarily unavailable." },503) };
 const { data: { user },error }=await client.auth.getUser();
 if (error || !user) return { response: privateJson({ error: "Please sign in to continue." },401) };
 return { client };
}
export function postError(error: { code?: string }) {
 if (error.code==="P0001") return privateJson({ error: "You’re posting quickly. Wait a minute and try again." },429);
 if (error.code==="P0005") return privateJson({ error: "Your attachment allowance is full. Remove unused draft files or try again tomorrow." },429);
 return databaseError(error);
}
