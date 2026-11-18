import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), getUser: vi.fn() }));
vi.mock("@/server/services/sessions", () => ({ mutate: mocks.mutate }));
vi.mock("@/server/supabase/clients", () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
import { POST } from "../../src/app/api/rolls/route";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("always uses normal database accounting despite stale force-win and legacy bridge flags", async () => {
  vi.stubEnv("SLOTTY_TEST_WINS", "true");
  vi.stubEnv("SLOTTY_REEL_BENCH", "1"); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  const saved = { roll: { id: "77777777-7777-4777-8777-777777777777", wheels: ["garnet", "garnet", "garnet"], won: true, slot: 4 } };
  mocks.mutate.mockResolvedValue(saved);
  const response = await POST(new Request("https://slotty.example/api/rolls", { method: "POST", headers: { origin: "https://slotty.example", "Content-Type": "application/json" }, body: JSON.stringify({ key: "11111111-1111-4111-8111-111111111111", allocations: [0, 0, 0, 1] }) }));
  expect(response.status).toBe(200); expect(await response.json()).toEqual(saved);
  expect(mocks.mutate).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
});
