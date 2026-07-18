import { loadConfig } from "@localflix/config";
import { NextResponse } from "next/server";
import { getDatabase } from "../../../../src/server/database";
import { preparePlayback } from "../../../../src/server/playback";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await context.params;
    return NextResponse.json(preparePlayback(getDatabase(), fileId, loadConfig().dataDirectory));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare playback" },
      { status: 404 }
    );
  }
}
