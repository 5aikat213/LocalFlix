import { readFile } from "node:fs/promises";
import { loadConfig } from "@localflix/config";
import { NextResponse } from "next/server";
import { getDatabase } from "../../../../src/server/database";
import { prepareSubtitleAsset } from "../../../../src/server/subtitles";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ trackId: string }> }) {
  try {
    const { trackId } = await context.params;
    const subtitle = await prepareSubtitleAsset(getDatabase(), trackId, loadConfig().dataDirectory);
    if (subtitle.status === "pending") {
      return NextResponse.json({ status: "pending" }, { status: 202 });
    }
    return new Response(await readFile(subtitle.absolutePath), {
      headers: { "Content-Type": subtitle.contentType, "Cache-Control": "private, max-age=3600" }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Subtitle not found" },
      { status: 404 }
    );
  }
}
