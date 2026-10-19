import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/server/validation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const client = await getSupabaseServerClient();
    if (client) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(safeRedirectPath(url.searchParams.get("next")), url.origin));
    }
  }
  return NextResponse.redirect(new URL("/?authError=confirmation", url.origin));
}
