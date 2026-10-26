import { getSupabaseServerClient } from "@/lib/supabase/server";
import { databaseError, privateJson } from "@/lib/server/responses";
import { hasAllowedOrigin, orbitActionSchema } from "@/lib/server/validation";
import { withPostCleanup } from "@/lib/server/post-cleanup";
import { withAvatars } from "@/lib/server/avatars";

export const dynamic = "force-dynamic";

async function authenticatedClient() {
  const client = await getSupabaseServerClient();
  if (!client) return { response: privateJson({ error: "Connect Supabase to enable your account. See .env.example." }, 503) };
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { response: privateJson({ error: "Please sign in to continue." }, 401) };
  return { client };
}

export async function GET() {
  const auth = await authenticatedClient();
  if (auth.response) return auth.response;
  const { data, error } = await auth.client.rpc("orbit_get_data");
  if (error) return databaseError(error);
  return privateJson(await withAvatars(auth.client, await withPostCleanup(auth.client,data)));
}

export async function POST(request: Request) {
  if (!hasAllowedOrigin(request)) return privateJson({ error: "This request came from an unrecognized origin." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return privateJson({ error: "Send an application/json request." }, 415);
  }
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 16_384) return privateJson({ error: "This request is too large." }, 413);
  const auth = await authenticatedClient();
  if (auth.response) return auth.response;

  let value: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 16_384) return privateJson({ error: "This request is too large." }, 413);
    value = JSON.parse(body);
  } catch {
    return privateJson({ error: "Send a valid JSON request." }, 400);
  }
  const parsed = orbitActionSchema.safeParse(value);
  if (!parsed.success) return privateJson({ error: parsed.error.issues[0]?.message ?? "Check your form details." }, 400);
  const { data, error } = parsed.data.type === "update_visibility"
    ? await auth.client.rpc("orbit_set_profile_visibility", { p_field: parsed.data.field, p_visible: parsed.data.visible })
    : await auth.client.rpc("orbit_mutate", { p_action: parsed.data });
  if (error) return databaseError(error);
  return privateJson(await withAvatars(auth.client, await withPostCleanup(auth.client,data)));
}
