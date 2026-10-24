import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getClient: vi.fn(), getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.getClient }));
import { GET, POST } from "./route";

const id = "50000000-0000-4000-8000-000000000010";
const messageId = "50000000-0000-4000-8000-000000000020";
const context = () => ({ params: Promise.resolve({ id }) });
const post = (body: unknown, origin = "https://orbit.example") => new Request(`https://orbit.example/api/clubs/${id}/posts`, { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.getClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "viewer" } }, error: null });
  mocks.rpc.mockResolvedValue({ data: { sent: true }, error: null });
});

describe("club post routes", () => {
  it("blocks signed-out requests and cross-site writes", async () => {
    expect((await POST(post({ id: messageId, body: "Hello" }, "https://other.example"), context())).status).toBe(403);
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET(new Request(`https://orbit.example/api/clubs/${id}/posts`), context())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects forged post authors before touching the database", async () => {
    expect((await POST(post({ id: messageId, body: "Hello", authorId: id }), context())).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("sends only a bounded body, the club, and an idempotency ID", async () => {
    const response = await POST(post({ id: messageId, body: " Hello " }), context());
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("orbit_club_publish", { p_club: id, p_id: messageId, p_body: "Hello", p_files: [] });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("accepts the post limit and rejects longer content", async () => {
    expect((await POST(post({ id: messageId, body: "x".repeat(3000) }), context())).status).toBe(200);
    mocks.rpc.mockClear();
    expect((await POST(post({ id: messageId, body: "x".repeat(3001) }), context())).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed history cursors and reports revoked access", async () => {
    expect((await GET(new Request(`https://orbit.example/api/clubs/${id}/posts?before=other`), context())).status).toBe(400);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    const response = await GET(new Request(`https://orbit.example/api/clubs/${id}/posts`), context());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Follow this club to access its activity." });
  });
});
