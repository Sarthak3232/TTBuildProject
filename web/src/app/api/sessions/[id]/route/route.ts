import { z } from "zod";
import { ApiError, jsonError, noStore, readBody, requireUser } from "@/server/api";
import { getRoute, ingestRoute, routeBatchSchema } from "@/server/services/tracking";

type Context = { params: Promise<{ id: string }> };
function sessionId(value: string) {
  if (!z.uuid().safeParse(value).success) throw new ApiError(404, "not_found", "Activity not found");
  return value;
}

export async function GET(request: Request, context: Context) {
  try {
    const { user } = await requireUser(request);
    const id = sessionId((await context.params).id);
    return noStore(await getRoute(user.id, id));
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { user } = await requireUser(request, true);
    const id = sessionId((await context.params).id);
    const input = await readBody(request, routeBatchSchema);
    return noStore(await ingestRoute(user.id, id, input));
  } catch (error) { return jsonError(error); }
}
