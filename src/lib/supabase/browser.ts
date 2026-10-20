import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;
  client ??= createBrowserClient(url, key);
  return client;
}
