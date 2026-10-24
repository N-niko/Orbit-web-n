import { readFile, readdir } from "node:fs/promises";
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
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, metadata jsonb default '{}', primary key(bucket_id,name));
    create function storage.foldername(text) returns text[] language sql immutable as $$
      select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1)-1];
    $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, delete on storage.objects to authenticated;
    grant execute on function storage.foldername(text) to authenticated;
  `);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(migrations)).filter(name => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  await db.exec(await readFile(new URL("../supabase/tests/orbit_security.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/tests/orbit_onboarding.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/tests/orbit_people_search.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/tests/orbit_visibility.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/tests/orbit_clubs.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/tests/orbit_publishing.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/tests/orbit_social.sql", import.meta.url), "utf8"));
  console.log("Database checks passed: profile and club reactions, idempotent comments, attachment ownership and visibility, upload binding, profile post sharing, club posts, owner events, private event choices, removal and restore, all migrations, workspace security, resumable onboarding, housing validation, durable completion, private avatar access, cross-workspace people search, saved profile visibility, clubs, follower-only chat, idempotent sends, and chat history with private-field and anonymous-access checks. Storage uses a local schema shim; hosted uploads still need a live account test.");
} catch (error) {
  console.error("Database check failed:", error.message, error.detail || "", error.where || "", "position", error.position || error.internalPosition || "");
  if (error.query && error.position) console.error(error.query.slice(Math.max(0, Number(error.position)-180), Number(error.position)+180));
  process.exitCode = 1;
} finally {
  await db.close();
}
