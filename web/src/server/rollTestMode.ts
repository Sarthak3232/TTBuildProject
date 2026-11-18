import "server-only";
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { eligibleAllocations } from "@/domain/rolls/probability";
import { ApiError } from "./api";

export function testWinsEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.SLOTTY_TEST_WINS === "true";
}

export async function commitTestWin(userId: string, key: string, allocations: number[]) {
  if (!testWinsEnabled()) throw new ApiError(403, "test_mode", "Guaranteed-win testing is disabled.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new ApiError(503, "test_setup", "Guaranteed-win testing needs the server Supabase configuration.");
  const total = allocations.reduce((sum, amount) => sum + amount, 0);
  if (allocations.length !== 4 || allocations.some(n => !Number.isSafeInteger(n) || n < 0 || n > 1_000_000) || total < 1)
    throw new ApiError(422, "allocation", "Allocate at least one whole token.");
  const client = createClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  // The existing trusted accounting RPC owns the debit, funded-slot selection,
  // immutable wheel outputs and retry receipt. Never rewrite a saved losing roll.
  const { data, error } = await client.rpc("app_mutate", {
    p_user_id: userId, p_operation: "roll", p_key: key,
    p_payload: { allocations, winSample: 0, slotSample: randomInt(eligibleAllocations(allocations).reduce((sum,n)=>sum+n,0)) },
  });
  if (error) throw error;
  return data;
}
