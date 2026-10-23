import { z } from "zod";
import { clubCategories, clubListSchema, clubSchema, createClubSchema } from "@/lib/clubs";
import { clubBody, clubClient, clubResult } from "@/lib/server/clubs";
import { privateJson } from "@/lib/server/responses";

export async function GET(request: Request) {
  const auth = await clubClient();
  if (auth.response) return auth.response;
  const params = new URL(request.url).searchParams;
  const parsed = z.object({ q: z.string().trim().max(100), category: z.union([z.literal(""), z.enum(clubCategories)]), following: z.enum(["true", "false"]) })
    .safeParse({ q: params.get("q") ?? "", category: params.get("category") ?? "", following: params.get("following") ?? "false" });
  if (!parsed.success) return privateJson({ error: "Check your club filters." }, 400);
  const { data, error } = await auth.client.rpc("orbit_clubs_list", { p_query: parsed.data.q, p_category: parsed.data.category, p_following: parsed.data.following === "true" });
  return clubResult(data, error, clubListSchema);
}

export async function POST(request: Request) {
  const auth = await clubClient();
  if (auth.response) return auth.response;
  const body = await clubBody(request, createClubSchema);
  if (body.response) return body.response;
  const club = body.value;
  const { data, error } = await auth.client.rpc("orbit_club_create", { p_id: club.id, p_name: club.name, p_description: club.description, p_category: club.category, p_meeting: club.meeting, p_color: club.color });
  return clubResult(data, error, clubSchema);
}
