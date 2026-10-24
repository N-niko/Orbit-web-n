import { fileMime, reserveFileSchema, reservedFileSchema } from "@/lib/attachments";
import { marketPhotoBucket } from "@/lib/marketplace";
import { clubBody } from "@/lib/server/clubs";
import { marketClient, marketError } from "@/lib/server/marketplace";
import { privateJson } from "@/lib/server/responses";
export async function POST(request: Request) {
 const auth = await marketClient(); if (auth.response) return auth.response;
 const body = await clubBody(request, reserveFileSchema); if (body.response) return body.response;
 const mime = fileMime(body.value.name);
 if (!mime.startsWith("image/")) return privateJson({ error: "Choose a JPG, PNG, WebP, or GIF photo." }, 400);
 const { data: stale } = await auth.client.from("orbit_market_photos").select("id,path").is("listing_id", null).lt("created_at", new Date(Date.now() - 86400000).toISOString()).limit(50);
 if (stale?.length) {
  const { error } = await auth.client.storage.from(marketPhotoBucket).remove(stale.map(f => f.path));
  if (!error) for (const f of stale) await auth.client.rpc("orbit_market_photo", { p_action: { type: "release", id: f.id } });
 }
 const { data, error } = await auth.client.rpc("orbit_market_photo", { p_action: { type: "reserve", ...body.value, mime } });
 if (error) return marketError(error);
 const parsed = reservedFileSchema.safeParse(data);
 return parsed.success ? privateJson(parsed.data) : privateJson({ error: "The photo could not be prepared." }, 502);
}
