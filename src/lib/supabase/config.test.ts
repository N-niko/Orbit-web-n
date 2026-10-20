import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseConfig } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("Supabase connection settings", () => {
  it("accepts the current publishable-key name without a legacy variable", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(getSupabaseConfig()).toEqual({ url: "https://example.supabase.co", key: "sb_publishable_test" });
  });
  it("retains legacy deployments and ignores surrounding whitespace", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " https://example.supabase.co \n");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "  ");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", " sb_publishable_legacy_name \n");
    expect(getSupabaseConfig()).toEqual({ url: "https://example.supabase.co", key: "sb_publishable_legacy_name" });
  });
  it("prefers the current name when both are configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_current");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "old-key");
    expect(getSupabaseConfig().key).toBe("sb_publishable_current");
  });
  it("reports absent settings as empty rather than pretending the app is connected", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(getSupabaseConfig()).toEqual({ url: "", key: "" });
  });
});
