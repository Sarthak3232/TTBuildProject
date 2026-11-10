import "server-only";
import { z } from "zod";
import type { RouteIngestion, SavedRoute } from "@/domain/time/route";
import { ROUTE_LIMITS } from "@/domain/time/route";
import { createServiceClient } from "@/server/supabase/clients";
import { ApiError } from "@/server/api";
import { getSession } from "@/server/services/sessions";

export const routeBatchSchema = z.object({
  revision: z.number().int().nonnegative().safe(),
  gap: z.boolean().optional().default(false),
  points: z.array(z.object({
    sequence: z.number().int().nonnegative().safe(),
    capturedAt: z.iso.datetime({ offset: true }),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().nonnegative().max(ROUTE_LIMITS.maxAccuracyM),
  }).strict()).max(ROUTE_LIMITS.batchSize),
}).strict();

export async function getRoute(userId: string, sessionId: string): Promise<SavedRoute> {
  const session = await getSession(userId, sessionId);
  if (session.task.kind !== "run" && session.task.kind !== "walk") throw new ApiError(404, "not_found", "Run or walk not found");
  const db = createServiceClient();
  const { data, error } = await db.rpc("read_session_route", {
    p_user_id: userId, p_session_id: sessionId,
  });
  if (error) throw error;
  const { data: completion, error: completionError } = await db.from("completions").select("*").eq("user_id", userId).eq("session_id", sessionId).maybeSingle();
  if (completionError) throw completionError;
  return { ...(data as SavedRoute), completion: completion ? {
    id: completion.id, sessionId: completion.session_id, task: session.task,
    description: completion.description, reflection: completion.reflection,
    completedAt: completion.completed_at, timezone: completion.timezone,
    eligibleMs: completion.eligible_ms, distanceM: completion.distance_m, tokenAward: completion.token_award,
  } : null };
}

export async function ingestRoute(userId: string, sessionId: string, batch: z.infer<typeof routeBatchSchema>): Promise<RouteIngestion> {
  const { data, error } = await createServiceClient().rpc("ingest_route_points", {
    p_user_id: userId, p_session_id: sessionId, p_revision: batch.revision,
    p_points: batch.points, p_gap: batch.gap,
  });
  if (error) throw error;
  return data as RouteIngestion;
}
