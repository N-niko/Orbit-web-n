import { z } from "zod";
import { clubMessagesSchema, sendClubMessageSchema } from "@/lib/clubs";
import { clubBody, clubClient, clubIdSchema, clubResult, type ClubContext } from "@/lib/server/clubs";
import { privateJson } from "@/lib/server/responses";

export async function GET(request: Request, context: ClubContext) {
  const auth = await clubClient();
  if (auth.response) return auth.response;
  const id = clubIdSchema.safeParse((await context.params).id);
  const before = z.uuid().nullable().safeParse(new URL(request.url).searchParams.get("before"));
  if (!id.success || !before.success) return privateJson({ error: "Invalid chat request." }, 400);
  const { data, error } = await auth.client.rpc("orbit_club_messages", { p_club: id.data, p_before: before.data });
  return clubResult(data, error, clubMessagesSchema);
}

export async function POST(request: Request, context: ClubContext) {
  const auth = await clubClient();
  if (auth.response) return auth.response;
  const id = clubIdSchema.safeParse((await context.params).id);
  if (!id.success) return privateJson({ error: "Club not found." }, 404);
  const body = await clubBody(request, sendClubMessageSchema);
  if (body.response) return body.response;
  const { data, error } = await auth.client.rpc("orbit_club_send", { p_club: id.data, p_id: body.value.id, p_body: body.value.body });
  return clubResult(data, error, z.object({ sent: z.literal(true) }));
}
