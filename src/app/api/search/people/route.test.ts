import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getClient: vi.fn(), getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.getClient }));
import { GET } from "./route";

const request = (query = "Other Student") => new Request("https://orbit.example/api/search/people?q=" + encodeURIComponent(query));
const person = { id: "30000000-0000-4000-8000-000000000001", name: "Other Student", university: "Caldwell University", major: "Physics", year: "", graduationYear: 2030, color: "#eeeeee" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "viewer" } }, error: null });
  mocks.rpc.mockResolvedValue({ data: [person], error: null });
});

describe("authenticated people search endpoint", () => {
  it("blocks signed-out requests before calling the directory", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects short and oversized queries before calling the database", async () => {
    for (const query of ["", "a", "a".repeat(101)]) expect((await GET(request(query))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns only basic directory fields and never caches another user's results", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...person, email: "private@example.invalid", avatarPath: "private/photo.png" }], error: null });
    const response = await GET(request("  Other Student  "));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("orbit_search_people", { p_query: "Other Student", p_limit: 24 });
    expect(await response.json()).toEqual({ people: [person] });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("reports a missing migration as unavailable instead of showing no matches", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect((await GET(request())).status).toBe(503);
  });
});
