import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export function GET() {
  const { url, key } = getSupabaseConfig();
  return NextResponse.json({ status: "ok", service: "orbit", databaseConfigured: Boolean(url && key),
    configuration: { urlPresent: Boolean(url), publicKeyPresent: Boolean(key) },
  }, { headers: { "Cache-Control": "no-store" } });
}
