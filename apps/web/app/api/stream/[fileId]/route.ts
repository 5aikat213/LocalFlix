import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getDatabase } from "../../../../src/server/database";
import { parseByteRange, resolvePlayableFile } from "../../../../src/server/stream";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await context.params;
    const file = await resolvePlayableFile(getDatabase(), fileId);
    const rangeHeader = request.headers.get("range");
    const range = rangeHeader ? parseByteRange(rangeHeader, file.sizeBytes) : null;
    const start = range?.start ?? 0;
    const end = range?.end ?? file.sizeBytes - 1;
    const stream = Readable.toWeb(createReadStream(file.absolutePath, { start, end }));
    return new Response(stream as ReadableStream, {
      status: range ? 206 : 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "Content-Length": String(end - start + 1),
        "Content-Type": file.mimeType,
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${file.sizeBytes}` } : {})
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not stream media";
    const status = /range/i.test(message) ? 416 : /not found/i.test(message) ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
