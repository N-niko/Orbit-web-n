import { getSupabaseServerClient } from "@/lib/supabase/server";
import { databaseError, privateJson } from "@/lib/server/responses";
import { peopleQuerySchema, peopleResponseSchema } from "@/lib/people-search";

export async function GET(request: Request) {
  const client = await getSupabaseServerClient();
  if (!client) return privateJson({ error: "People search is temporarily unavailable." }, 503);
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return privateJson({ error: "Please sign in to search for people." }, 401);

  const parsed = peopleQuerySchema.safeParse(new URL(request.url).searchParams.get("q"));
  if (!parsed.success) return privateJson({ error: parsed.error.issues[0]?.message ?? "Enter a name to search." }, 400);
  const { data, error } = await client.rpc("orbit_search_people", { p_query: parsed.data, p_limit: 24 });
  if (error?.code === "PGRST202") return privateJson({ error: "People search is temporarily unavailable. Please try again later." }, 503);
  if (error) return databaseError(error);
  const result = peopleResponseSchema.safeParse({ people: data });
  if (!result.success) return privateJson({ error: "People search could not load. Please try again." }, 502);
  return privateJson(result.data);
}
