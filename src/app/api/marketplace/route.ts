import { marketActionSchema } from "@/lib/marketplace";
import { clubBody } from "@/lib/server/clubs";
import { marketClient, marketError } from "@/lib/server/marketplace";
import { privateJson } from "@/lib/server/responses";
export async function POST(request: Request) {
 const auth = await marketClient(); if (auth.response) return auth.response;
 const body = await clubBody(request, marketActionSchema); if (body.response) return body.response;
 const { data, error } = await auth.client.rpc("orbit_market", { p_action: body.value });
 return error ? marketError(error) : privateJson(data);
}
