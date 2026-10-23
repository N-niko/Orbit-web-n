import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { databaseError, privateJson } from "./responses";
import { hasAllowedOrigin } from "./validation";

export async function clubClient() {
  const client = await getSupabaseServerClient();
  if (!client) return { response: privateJson({ error: "Clubs are temporarily unavailable." }, 503) };
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { response: privateJson({ error: "Please sign in to explore clubs." }, 401) };
  return { client };
}

export async function clubBody<T>(request: Request, schema: z.ZodType<T>) {
  if (!hasAllowedOrigin(request)) return { response: privateJson({ error: "Unrecognized origin." }, 403) };
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return { response: privateJson({ error: "Send JSON." }, 415) };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 16384) return { response: privateJson({ error: "Request is too large." }, 413) };
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { response: privateJson({ error: "Invalid request." }, 400) }; }
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { response: privateJson({ error: parsed.error.issues[0]?.message ?? "Check your details." }, 400) };
  return { value: parsed.data };
}

export function clubError(error: { code?: string }) {
  if (error.code === "23505") return privateJson({ error: "A club with that name already exists. Try searching for it." }, 409);
  if (error.code === "42501") return privateJson({ error: "Follow this club to access its activity." }, 403);
  if (error.code === "P0001") return privateJson({ error: "You’re sending quickly. Wait a minute and try again." }, 429);
  if (error.code === "P0004") return privateJson({ error: "You can create up to 5 clubs per day. Try again tomorrow." }, 429);
  if (["PGRST202", "PGRST205", "42P01"].includes(error.code ?? "")) return privateJson({ error: "Clubs are temporarily unavailable. Please try again later." }, 503);
  return databaseError(error);
}

export function clubResult<T>(data: unknown, error: { code?: string } | null, schema: z.ZodType<T>) {
  if (error) return clubError(error);
  const parsed = schema.safeParse(data);
  return parsed.success ? privateJson(parsed.data) : privateJson({ error: "Clubs could not load. Please try again." }, 502);
}

export const clubIdSchema = z.uuid();
export type ClubContext = { params: Promise<{ id: string }> };
