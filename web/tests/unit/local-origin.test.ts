import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("@/server/supabase/clients", () => ({ createServerSupabaseClient: async () => ({ auth: { signInWithPassword: mocks.signIn } }) }));
import { assertSameOrigin, requestOrigin } from "../../src/server/api";
import { POST } from "../../src/app/api/auth/route";
beforeEach(() => { vi.stubEnv("NODE_ENV", "development"); mocks.signIn.mockResolvedValue({ error: null }); });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function request(origin = "http://127.0.0.1:3000", host = "127.0.0.1:3000", extra: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/auth", { method: "POST", headers: { origin, host, "Content-Type": "application/json", ...extra }, body: JSON.stringify({ action: "login", email: "test@example.invalid", password: "unit-test-only" }) });
}
it("authenticates using the real browser Host when Next normalizes the URL", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200); expect(mocks.signIn).toHaveBeenCalledOnce();
  expect(requestOrigin(request())).toBe("http://127.0.0.1:3000");
});
it.each(["localhost:3000", "127.0.0.1:3000", "[::1]:3000"])("accepts a matching loopback Host %s", host => {
  expect(() => assertSameOrigin(request(`http://${host}`, host))).not.toThrow();
});
it.each([
  ["https://other.invalid", "127.0.0.1:3000", {}],
  ["http://127.0.0.1:3001", "127.0.0.1:3001", {}],
  ["http://localhost:3000", "127.0.0.1:3000", {}],
  ["http://127.0.0.1:3000", "attacker.invalid:3000", {}],
  ["http://127.0.0.1:3000", "127.0.0.1:3000", { "sec-fetch-site": "cross-site" }],
  ["https://attacker.invalid", "127.0.0.1:3000", { "x-forwarded-host": "attacker.invalid", "x-forwarded-proto": "https" }],
] as const)("rejects mismatched origins or hosts", (origin, host, extra) => {
  expect(() => assertSameOrigin(request(origin, host, extra))).toThrow();
});
it("still rejects absent origins", () => {
  const r = request(); r.headers.delete("origin"); expect(() => assertSameOrigin(r)).toThrow();
});
it("keeps the production origin check strict", () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(() => assertSameOrigin(request())).toThrow();
});
