import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getDatabase } from "../../../../src/server/database";
import { resolvePreviewSource, spawnPreview } from "../../../../src/server/preview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await context.params;
    const source = await resolvePreviewSource(getDatabase(), fileId);
    const child = spawnPreview(source);
    child.stderr.resume();

    const output = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
    const reader = output.getReader();
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    };
    const abort = () => {
      stop();
      void reader.cancel("Preview request aborted");
    };
    request.signal.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => child.stdout.destroy(error));

    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            request.signal.removeEventListener("abort", abort);
            controller.close();
            return;
          }
          controller.enqueue(chunk.value);
        } catch (error) {
          request.signal.removeEventListener("abort", abort);
          controller.error(error);
          stop();
        }
      },
      cancel(reason) {
        request.signal.removeEventListener("abort", abort);
        stop();
        return reader.cancel(reason);
      }
    });

    return new Response(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "video/mp4",
        "X-Content-Type-Options": "nosniff",
        "X-LocalFlix-Preview-Start": String(source.startSeconds)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create preview";
    return NextResponse.json(
      { error: message },
      { status: /not found/i.test(message) ? 404 : 422 }
    );
  }
}
