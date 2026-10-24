import { getSupabaseServerClient } from "@/lib/supabase/server";
import { databaseError, privateJson } from "./responses";
export async function marketClient() {
 const client = await getSupabaseServerClient();
 if (!client) return { response: privateJson({ error: "Marketplace is temporarily unavailable." }, 503) };
 const { data: { user }, error } = await client.auth.getUser();
 if (error || !user) return { response: privateJson({ error: "Sign in to use Marketplace." }, 401) };
 return { client };
}
export function marketError(error: { code?: string }) {
 if (error.code === "42501") return privateJson({ error: "Marketplace requires a confirmed Caldwell University email (@caldwell.edu). Private inquiries are only available to their participants." }, 403);
 if (error.code === "P0006") return privateJson({ error: "This listing contains a prohibited item. Review the Marketplace rules." }, 400);
 if (["P0001", "P0004", "P0005"].includes(error.code || "")) return privateJson({ error: "You’ve reached a Marketplace limit. Wait before posting or uploading again." }, 429);
 if (["PGRST202", "PGRST205", "42P01"].includes(error.code || "")) return privateJson({ error: "Marketplace is being set up. Please try again shortly." }, 503);
 return databaseError(error);
}
