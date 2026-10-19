import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Run the actual migration and access assertions in disposable PostgreSQL.
// The auth shim provides only the Supabase auth schema and JWT subject function.
// No account, network connection, or production database is used.
const db = new PGlite();
try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/202610180001_orbit.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/tests/orbit_security.sql", import.meta.url), "utf8"));
  console.log("Database checks passed: migration, workspace isolation, anonymous access, invite joins, authenticated identity, shared task updates, likes, RSVPs, and creator-only deletion.");
} finally {
  await db.close();
}
