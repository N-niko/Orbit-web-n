import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { databaseError, privateJson } from "@/lib/server/responses";
import { profilePageSchema } from "@/lib/profile-page";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const client = await getSupabaseServerClient();
  if (!client) return privateJson({ error: "Profiles are temporarily unavailable." }, 503);
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return privateJson({ error: "Please sign in to view profiles." }, 401);
  const id = z.uuid().safeParse((await context.params).id);
  const before = z.uuid().nullable().safeParse(new URL(request.url).searchParams.get("before"));
  if (!id.success || !before.success) return privateJson({ error: "Invalid profile request." }, 400);
  const { data, error } = await client.rpc("orbit_profile_page", { p_profile: id.data, p_before: before.data });
  if (error) return databaseError(error);
  const parsed = profilePageSchema.safeParse(data);
  return parsed.success ? privateJson(parsed.data) : privateJson({ error: "This profile could not load. Please try again." }, 502);
}
