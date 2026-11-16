import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
import { studyCommand } from "../../src/server/services/studbot";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "isolated-test-server-key");
  vi.stubEnv("STUDBOT_TEST_REWARDS", "false");
  vi.stubEnv("NODE_ENV", "development");
  mocks.rpc.mockResolvedValue({ data: { activity: null, balance: 0 }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("does not request accelerated rewards by default", async () => {
  await studyCommand("owner", "start", { windowId: "window" });
  expect(mocks.rpc.mock.calls[0][1].p_test_mode).toBeUndefined();
});
it("requests the 15-second policy only for new development start requests", async () => {
  vi.stubEnv("STUDBOT_TEST_REWARDS", "true");
  expect((await studyCommand("owner", "start", { windowId: "window" })).testRewards).toBe(true);
  expect(mocks.rpc.mock.calls[0][1].p_test_mode).toBe(true);
  await studyCommand("owner", "load");
  expect(mocks.rpc.mock.calls[1][1].p_test_mode).toBeUndefined();
});
it("ignores the test switch in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("STUDBOT_TEST_REWARDS", "true");
  expect((await studyCommand("owner", "start", { windowId: "window" })).testRewards).toBe(false);
  expect(mocks.rpc.mock.calls[0][1].p_test_mode).toBeUndefined();
});
