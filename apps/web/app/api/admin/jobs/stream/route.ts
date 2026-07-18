import { getDatabase } from "../../../../../src/server/database";
import { serializeJobEvent } from "../../../../../src/server/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = () => {
        for (const job of getDatabase().jobs.listRecent()) {
          controller.enqueue(encoder.encode(serializeJobEvent(job)));
        }
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      };
      push();
      interval = setInterval(push, 1_000);
      request.signal.addEventListener(
        "abort",
        () => {
          if (interval !== null) clearInterval(interval);
          controller.close();
        },
        { once: true }
      );
    },
    cancel() {
      if (interval !== null) clearInterval(interval);
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no"
    }
  });
}
