import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { commitTestWin, testWinsEnabled } from "../../src/server/rollTestMode";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("SLOTTY_TEST_WINS", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("SUPABASE_SECRET_KEY", "server-test-secret");
  mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("forces only the trusted win sample and preserves the user, allocations and retry key", async () => {
  const saved = { roll: { won: true, slot: 4, wheels: ["garnet", "garnet", "garnet"] } };
  mocks.rpc.mockResolvedValue({ data: saved, error: null });
  expect(await commitTestWin("owner", "same-key", [0, 0, 0, 3])).toEqual(saved);
  const [name, input] = mocks.rpc.mock.calls[0];
  expect(name).toBe("app_mutate"); expect(input).toMatchObject({ p_user_id: "owner", p_key: "same-key", p_operation: "roll", p_payload: { allocations: [0, 0, 0, 3], winSample: 0 } });
  expect(input.p_payload.slotSample).toBeGreaterThanOrEqual(0); expect(input.p_payload.slotSample).toBeLessThan(3);
});
it("returns an existing saved loss unchanged rather than rerolling it", async () => {
  const saved = { roll: { won: false, slot: null, wheels: ["hammer", "garnet", "tongs"] } };
  mocks.rpc.mockResolvedValue({ data: saved, error: null });
  expect(await commitTestWin("owner", "existing-key", [1, 0, 0, 0])).toEqual(saved);
});
it("cannot be enabled in production", async () => {
  vi.stubEnv("NODE_ENV", "production"); expect(testWinsEnabled()).toBe(false);
  await expect(commitTestWin("owner", "key", [1, 0, 0, 0])).rejects.toThrow("disabled");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("requires the explicit server opt-in", async () => {
  vi.stubEnv("SLOTTY_TEST_WINS", "false");
  await expect(commitTestWin("owner", "key", [1, 0, 0, 0])).rejects.toThrow("disabled");
});
it("preserves accounting failures and never fabricates a winning result", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "Insufficient tokens" } });
  await expect(commitTestWin("owner", "key", [1, 0, 0, 0])).rejects.toMatchObject({ code: "22023" });
});
