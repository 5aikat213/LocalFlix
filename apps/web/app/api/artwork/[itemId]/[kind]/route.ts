import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { loadConfig } from "@localflix/config";
import { NextResponse } from "next/server";
import { resolveArtwork } from "../../../../../src/server/artwork";
import { getDatabase } from "../../../../../src/server/database";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string; kind: string }> }
) {
  try {
    const { itemId, kind } = await context.params;
    const artwork = await resolveArtwork(getDatabase(), itemId, kind, loadConfig().dataDirectory);
    return new Response(Readable.toWeb(createReadStream(artwork.absolutePath)) as ReadableStream, {
      headers: {
        "Content-Type": artwork.contentType,
        "Content-Length": String(artwork.sizeBytes),
        "Cache-Control": "private, max-age=86400"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Artwork not found" },
      { status: 404 }
    );
  }
}
