import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/server/supabase/clients", () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
import { POST } from "../../src/app/api/studbot/[action]/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "https://slotty.example");
  vi.stubEnv("ML_SERVICE_URL", "https://ml.example");
  vi.stubEnv("ML_INTERNAL_TOKEN", "isolated-test-token-0123456789012345");
});

it("checks Supabase auth even for direct API requests", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  const response = await POST(new Request("https://slotty.example/api/studbot/open", {
    method: "POST", headers: { origin: "https://slotty.example" },
  }), { params: Promise.resolve({ action: "open" }) });
  expect(response.status).toBe(401);
  expect(mocks.getUser).toHaveBeenCalledOnce();
});

it("rejects cross-site image uploads before consulting authentication", async () => {
  const response = await POST(new Request("https://slotty.example/api/studbot/screen", {
    method: "POST", headers: { origin: "https://other.example", "Content-Type": "image/jpeg" },
    body: new Uint8Array([255, 216, 255, 217]),
  }), { params: Promise.resolve({ action: "screen" }) });
  expect(response.status).toBe(403);
  expect(mocks.getUser).not.toHaveBeenCalled();
});
