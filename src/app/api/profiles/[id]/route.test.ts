import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getClient: vi.fn(), getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.getClient }));
import { GET } from "./route";
const id = "60000000-0000-4000-8000-000000000001";
const context = () => ({ params: Promise.resolve({ id }) });
const request = (suffix = "") => new Request(`https://orbit.example/api/profiles/${id}${suffix}`);
beforeEach(() => {
  vi.resetAllMocks(); mocks.getClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "viewer" } }, error: null });
});
describe("public profile route", () => {
  it("blocks anonymous requests and invalid cursors before querying", async () => {
    expect((await GET(request("?before=forged"), context())).status).toBe(400);
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET(request(), context())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns only the safe profile projection and uncached posts", async () => {
    mocks.rpc.mockResolvedValue({ data: { profile: { id, name: "Alice", university: "Caldwell University", major: "", year: "", graduationYear: null, bio: "Hello", color: "#eee", email: "private@example.invalid" }, posts: [], hasMore: false, workspace: { inviteCode: "private" } }, error: null });
    const response = await GET(request(), context()); const result = await response.json();
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(result.profile.email).toBeUndefined(); expect(result.workspace).toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("orbit_profile_page", { p_profile: id, p_before: null });
  });
});
