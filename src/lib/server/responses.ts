import { NextResponse } from "next/server";

export function privateJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "X-Content-Type-Options": "nosniff" },
  });
}

export function databaseError(error: { code?: string; message?: string }) {
  if (error.code === "42501") return privateJson({ error: "You do not have permission to change that item." }, 403);
  if (error.code === "P0002") return privateJson({ error: "That item or invite code could not be found." }, 404);
  if (error.code === "22023" || error.code === "22P02" || error.code === "22007" || error.code === "23514") {
    return privateJson({ error: "Some details are invalid. Please check them and try again." }, 400);
  }
  if (error.code === "PGRST202" || error.code === "42P01") {
    return privateJson({ error: "The database needs setup. Apply the SQL migration in supabase/migrations." }, 503);
  }
  // Never return database internals or private row values to the browser.
  console.error("Orbit database request failed", { code: error.code });
  return privateJson({ error: "Orbit could not save your changes. Please try again." }, 500);
}
