import { signupSchema } from "@/lib/account";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { hasAllowedOrigin } from "@/lib/server/validation";
import { privateJson } from "@/lib/server/responses";
import { authErrorMessage } from "@/lib/auth-errors";

export async function POST(request: Request) {
  if (!hasAllowedOrigin(request)) return privateJson({ error: "Unrecognized origin." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return privateJson({ error: "Send JSON." }, 415);
  const body = await request.text();
  if (body.length > 4096) return privateJson({ error: "Request is too large." }, 413);
  let value: unknown;
  try { value = JSON.parse(body); } catch { return privateJson({ error: "Invalid request." }, 400); }
  const parsed = signupSchema.safeParse(value);
  if (!parsed.success) return privateJson({ error: parsed.error.issues[0]?.message ?? "Check your account details." }, 400);
  const client = await getSupabaseServerClient();
  if (!client) return privateJson({ error: "Account setup is unavailable. Please try again later." }, 503);
  const { name, email, password, major, graduationYear } = parsed.data;
  const { data, error } = await client.auth.signUp({ email, password, options: {
    emailRedirectTo: `${new URL(request.url).origin}/auth/callback`,
    data: { name, major, graduation_year: graduationYear },
  } });
  if (error) return privateJson({ error: authErrorMessage(error) }, error.status === 429 ? 429 : 400);
  return privateJson({ confirmationRequired: !data.session });
}
