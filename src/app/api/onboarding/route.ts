import { onboardingSchema } from "@/lib/account";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { hasAllowedOrigin } from "@/lib/server/validation";
import { databaseError, privateJson } from "@/lib/server/responses";
import { withAvatars } from "@/lib/server/avatars";

export async function POST(request: Request) {
  if (!hasAllowedOrigin(request)) return privateJson({ error: "Unrecognized origin." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "Send JSON." }, 415);
  const client = await getSupabaseServerClient();
  if (!client) return privateJson({ error: "Accounts are unavailable." }, 503);
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return privateJson({ error: "Please sign in again to finish setup." }, 401);
  const body = await request.text();
  if (body.length > 4096) return privateJson({ error: "Request is too large." }, 413);
  let value: unknown;
  try { value = JSON.parse(body); } catch { return privateJson({ error: "Invalid request." }, 400); }
  const parsed = onboardingSchema.safeParse(value);
  if (!parsed.success) return privateJson({ error: parsed.error.issues[0]?.message ?? "Check your setup details." }, 400);
  const input = parsed.data;
  const { data, error } = await client.rpc("orbit_save_onboarding", {
    p_major: input.major, p_graduation_year: input.graduationYear,
    p_residency: input.residency, p_residence_hall: input.residenceHall,
    p_avatar_path: input.avatarPath, p_complete: input.complete,
  });
  if (error) return databaseError(error);
  return privateJson(await withAvatars(client, data));
}
