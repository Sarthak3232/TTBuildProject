import { z } from "zod";
import { requireUser, readBody, jsonError, noStore, keySchema } from "@/server/api";
import { studyCommand } from "@/server/services/studbot";

export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);
    return noStore(await studyCommand(user.id, "load"));
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request, true);
    const { action, sessionId, key } = await readBody(request, z.object({
      action: z.enum(["complete", "cancel"]), sessionId: z.uuid(), key: keySchema,
    }).strict());
    return noStore(await studyCommand(user.id, action, { sessionId, key }));
  } catch (error) { return jsonError(error); }
}
