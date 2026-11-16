import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Activity, Completion } from "@/domain/activity";
import { ApiError } from "../api";
import type { Database } from "../supabase/database.types";

export type StudyProgress = { activity: Activity | null; completion?: Completion | null; balance: number; serverTime?: string };
type Command = "load" | "start" | "observe" | "pause" | "complete" | "cancel";

export async function studyCommand(userId: string, action: Command, options: {
  sessionId?: string; windowId?: string; sequence?: number;
  observation?: "compatible" | "away" | "unknown"; key?: string;
} = {}): Promise<StudyProgress> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new ApiError(503, "study_setup", "Supabase study saving needs SUPABASE_SECRET_KEY on the website server.");
  // Never use the user's cookie/JWT on this client, and never expose it to React.
  const client = createClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.rpc("studbot_command", {
    p_user_id: userId, p_action: action, p_session_id: options.sessionId,
    p_window_id: options.windowId, p_sequence: options.sequence,
    p_observation: options.observation, p_key: options.key,
  });
  if (error) {
    const status = error.code === "P0002" ? 404 : ["23505", "40001"].includes(error.code) ? 409 : error.code === "22023" ? 422 : 503;
    throw new ApiError(status, "study_save", status === 503
      ? "Study progress could not be saved. Check the Supabase connection and Studbot migration."
      : error.message);
  }
  return data as unknown as StudyProgress;
}
