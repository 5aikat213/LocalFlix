import { NextResponse } from "next/server";
import { getDatabase } from "../../../../../../src/server/database";
import { savePlaybackProgress } from "../../../../../../src/server/progress";

export async function GET(
  _request: Request,
  context: { params: Promise<{ profileId: string; fileId: string }> }
) {
  const { profileId, fileId } = await context.params;
  const database = getDatabase();
  const progress = database.profiles.getProgress(profileId, fileId);
  if (progress) return NextResponse.json(progress);
  const file = database.sqlite
    .prepare("select duration_ms as durationMs from media_files where id = ?")
    .get(fileId) as { durationMs: number | null } | undefined;
  return NextResponse.json({
    profileId,
    mediaFileId: fileId,
    positionMs: 0,
    durationMs: file?.durationMs ?? 0,
    completed: false,
    lastWatchedAt: null
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ profileId: string; fileId: string }> }
) {
  try {
    const { profileId, fileId } = await context.params;
    const body = (await request.json()) as {
      positionMs?: unknown;
      durationMs?: unknown;
      completed?: unknown;
    };
    if (typeof body.positionMs !== "number" || typeof body.durationMs !== "number") {
      return NextResponse.json({ error: "positionMs and durationMs are required" }, { status: 400 });
    }
    return NextResponse.json(
      savePlaybackProgress(getDatabase(), {
        profileId,
        mediaFileId: fileId,
        positionMs: body.positionMs,
        durationMs: body.durationMs,
        completed: body.completed === true
      })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save progress" },
      { status: 400 }
    );
  }
}
