import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), command: vi.fn() }));
vi.mock("@/server/supabase/clients", () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/server/services/studbot", () => ({ studyCommand: mocks.command }));
import { GET, POST } from "../../src/app/api/studbot/session/route";
const sessionId = "11111111-1111-4111-8111-111111111111";
const key = "22222222-2222-4222-8222-222222222222";
function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/studbot/session", { method: "POST",
    headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
  mocks.command.mockResolvedValue({ activity: null, completion: { tokenAward: 1 }, balance: 1 });
});
it("loads the signed-in user's saved progress", async () => {
  expect((await GET(new Request("http://localhost:3000/api/studbot/session"))).status).toBe(200);
  expect(mocks.command).toHaveBeenCalledWith("verified-user", "load");
});
it("finishes using verified ownership and the retry key, with no browser duration", async () => {
  const response = await POST(request({ action: "complete", sessionId, key }));
  expect(response.status).toBe(200);
  expect(mocks.command).toHaveBeenCalledWith("verified-user", "complete", { sessionId, key });
});
it.each([{ elapsedMs: 1800000 }, { observation: "compatible" }, { userId: "someone-else" }, { tokenAward: 999 }])("rejects forged privileged input %j", async extra => {
  expect((await POST(request({ action: "complete", sessionId, key, ...extra }))).status).toBe(422);
  expect(mocks.command).not.toHaveBeenCalled();
});
it("requires sign-in for reads and mutations", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await GET(new Request("http://localhost:3000/api/studbot/session"))).status).toBe(401);
  expect((await POST(request({ action: "complete", sessionId, key }))).status).toBe(401);
  expect(mocks.command).not.toHaveBeenCalled();
});
it("rejects cross-site completion requests", async () => {
  expect((await POST(request({ action: "complete", sessionId, key }, "https://other.example"))).status).toBe(403);
  expect(mocks.command).not.toHaveBeenCalled();
});
