import { clubSchema, followClubSchema } from "@/lib/clubs";
import { clubBody, clubClient, clubIdSchema, clubResult, type ClubContext } from "@/lib/server/clubs";
import { privateJson } from "@/lib/server/responses";

export async function POST(request: Request, context: ClubContext) {
  const auth = await clubClient();
  if (auth.response) return auth.response;
  const id = clubIdSchema.safeParse((await context.params).id);
  if (!id.success) return privateJson({ error: "Club not found." }, 404);
  const body = await clubBody(request, followClubSchema);
  if (body.response) return body.response;
  const { data, error } = await auth.client.rpc("orbit_club_follow", { p_club: id.data, p_follow: body.value.following });
  return clubResult(data, error, clubSchema);
}
