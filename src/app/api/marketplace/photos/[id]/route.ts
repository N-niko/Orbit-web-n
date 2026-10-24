import { z } from "zod";
import { fileInfoSchema } from "@/lib/attachments";
import { marketPhotoBucket } from "@/lib/marketplace";
import { marketClient, marketError } from "@/lib/server/marketplace";
import { privateJson } from "@/lib/server/responses";
import { hasAllowedOrigin } from "@/lib/server/validation";
type Context = { params: Promise<{ id: string }> };
async function getInfo(context: Context) {
 const auth = await marketClient(); if (auth.response) return { response: auth.response };
 const id = z.uuid().safeParse((await context.params).id);
 if (!id.success) return { response: privateJson({ error: "Photo not found." }, 404) };
 const { data, error } = await auth.client.rpc("orbit_market_photo", { p_action: { type: "info", id: id.data } });
 if (error) return { response: marketError(error) };
 const file = fileInfoSchema.safeParse(data);
 if (!file.success) return { response: privateJson({ error: "Photo could not load." }, 502) };
 return { client: auth.client, file: file.data, response: undefined };
}
export async function GET(_request: Request, context: Context) {
 const info = await getInfo(context); if (info.response) return info.response;
 const { data, error } = await info.client.storage.from(marketPhotoBucket).createSignedUrl(info.file.path, 60);
 if (error || !data?.signedUrl) return privateJson({ error: "Photo unavailable. Try again." }, 404);
 return new Response(null, { status: 302, headers: { Location: data.signedUrl, "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "X-Content-Type-Options": "nosniff" } });
}
export async function DELETE(request: Request, context: Context) {
 if (!hasAllowedOrigin(request)) return privateJson({ error: "Unrecognized origin." }, 403);
 const info = await getInfo(context); if (info.response) return info.response;
 if (!info.file.pending) return privateJson({ error: "Remove this photo by editing its listing." }, 409);
 const { error: removeError } = await info.client.storage.from(marketPhotoBucket).remove([info.file.path]);
 if (removeError) return privateJson({ error: "Photo could not be removed. Try again." }, 503);
 const { data, error } = await info.client.rpc("orbit_market_photo", { p_action: { type: "release", id: info.file.id } });
 return error ? marketError(error) : privateJson(data);
}
