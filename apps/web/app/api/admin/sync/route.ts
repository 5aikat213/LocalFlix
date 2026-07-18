import { getDatabase } from "../../../../src/server/database";
import { enqueueLibrarySync } from "../../../../src/server/sync";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const job = enqueueLibrarySync(getDatabase());
  return Response.json(
    {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress
    },
    { status: 202 }
  );
}

