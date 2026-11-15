import { createStudbotBridge } from "@/server/studbot-bridge";
import { createServerSupabaseClient } from "@/server/supabase/clients";

export const runtime = "nodejs";

const shared = globalThis as typeof globalThis & { studbotWebBridge?: ReturnType<typeof createStudbotBridge> };
const studbotBridge = shared.studbotWebBridge ??= createStudbotBridge({
  config: () => ({ mode: process.env.NODE_ENV ?? "", appUrl: process.env.APP_URL,
    serviceUrl: process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8000", token: process.env.ML_INTERNAL_TOKEN ?? "" }),
  authorize: async () => {
    const client = await createServerSupabaseClient();
    const { data: { user }, error } = await client.auth.getUser();
    return error ? null : user?.id ?? null;
  },
});

async function handle(request: Request, context: { params: Promise<{ action: string }> }) {
  return studbotBridge(request, (await context.params).action);
}

export const GET = handle;
export const POST = handle;
