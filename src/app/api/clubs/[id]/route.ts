import { clubSchema } from "@/lib/clubs";
import { clubClient, clubIdSchema, clubResult, type ClubContext } from "@/lib/server/clubs";
import { privateJson } from "@/lib/server/responses";

export async function GET(_request: Request, context: ClubContext) {
  const auth = await clubClient();
  if (auth.response) return auth.response;
  const id = clubIdSchema.safeParse((await context.params).id);
  if (!id.success) return privateJson({ error: "Club not found." }, 404);
  const { data, error } = await auth.client.rpc("orbit_club_get", { p_club: id.data });
  return clubResult(data, error, clubSchema);
}
