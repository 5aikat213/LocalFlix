import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { loadConfig } from "@localflix/config";
import { NextResponse } from "next/server";
import { getDatabase } from "../../../../../src/server/database";
import { resolveHlsAsset } from "../../../../../src/server/playback";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string; asset: string }> }
) {
  try {
    const { fileId, asset } = await context.params;
    const resolved = resolveHlsAsset(getDatabase(), fileId, asset, loadConfig().dataDirectory);
    const info = await stat(resolved.absolutePath);
    const stream = Readable.toWeb(createReadStream(resolved.absolutePath));
    return new Response(stream as ReadableStream, {
      headers: {
        "Content-Type": resolved.contentType,
        "Content-Length": String(info.size),
        "Cache-Control": asset.endsWith(".ts") ? "private, max-age=31536000, immutable" : "private, no-cache"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "HLS asset not found" },
      { status: 404 }
    );
  }
}
