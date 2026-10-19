import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", service: "orbit", databaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) }, { headers: { "Cache-Control": "no-store" } });
}
