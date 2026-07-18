import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { loadConfig } from "@localflix/config";
import { openDatabase } from "@localflix/database";
import { SyncService } from "./sync-service";
import { Worker } from "./worker";
import { MetadataEnrichmentService, type EnrichmentPayload } from "./enrichment-service";
import { buildMetadataProviders } from "./metadata-runtime";
import { HlsTranscodeService, type HlsTranscodePayload } from "./hls-transcode-service";
import {
  SubtitleConversionService,
  type SubtitleConversionPayload
} from "./subtitle-conversion-service";

export type WorkerCommand = "worker" | "sync" | "index" | "refresh-metadata";

export function parseWorkerCommand(args: readonly string[]): WorkerCommand {
  const [command] = args;
  if (
    command === "worker" ||
    command === "sync" ||
    command === "index" ||
    command === "refresh-metadata"
  ) {
    return command;
  }
  throw new Error(
    "LocalFlix worker command must be 'worker', 'sync', 'index', or 'refresh-metadata'"
  );
}

async function run(): Promise<void> {
  const command = parseWorkerCommand(process.argv.slice(2));
  const config = loadConfig();
  const database = openDatabase(config);
  const sync = new SyncService({ database, config });

  if (command === "sync") {
    const result = await sync.run();
    process.stdout.write(
      `LocalFlix sync complete: ${result.discoveredCount} discovered, ${result.indexedCount} indexed, ${result.offlineRootIds.length} offline root(s).\n`
    );
    database.close();
    return;
  }

  const enrichment = new MetadataEnrichmentService({
    database,
    dataDirectory: config.dataDirectory,
    providers: buildMetadataProviders(config)
  });
  const hls = new HlsTranscodeService({ database, dataDirectory: config.dataDirectory });
  const subtitles = new SubtitleConversionService({
    database,
    dataDirectory: config.dataDirectory
  });
  const workerId = `worker-${randomUUID()}`;
  const worker = new Worker({
    database,
    workerId,
    handlers: {
      "scan-library": async () => {
        await sync.run();
      },
      "enrich-item": async (payload) => {
        await enrichment.enrich(payload as EnrichmentPayload);
      },
      "transcode-hls": async (payload, context) => {
        context.progress(0.05);
        await hls.transcode(payload as HlsTranscodePayload);
        context.progress(1);
      },
      "convert-subtitle": async (payload) => {
        await subtitles.convert(payload as SubtitleConversionPayload);
      }
    }
  });
  if (command === "refresh-metadata") {
    const candidates = database.catalog.listAllEnrichmentCandidates();
    for (const payload of candidates) {
      database.jobs.enqueueUnique("enrich-item", payload.itemId, payload);
    }
    let processed = 0;
    while (await worker.runOne()) processed += 1;
    process.stdout.write(
      `LocalFlix metadata refresh complete: ${processed} job(s) processed for ${candidates.length} title(s).\n`
    );
    database.close();
    return;
  }
  if (command === "index") {
    const result = await sync.run();
    let enriched = 0;
    while (await worker.runOne()) enriched += 1;
    process.stdout.write(
      `LocalFlix index complete: ${result.indexedCount} files indexed, ${enriched} metadata job(s) processed.\n`
    );
    database.close();
    return;
  }
  if (config.scanOnStartup) {
    database.jobs.enqueueUnique("scan-library", "library-roots", {});
  }
  process.stdout.write(
    `LocalFlix worker ${workerId} ready with concurrency ${config.workerConcurrency}.\n`
  );
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  while (!stopping) {
    const handled = await worker.runOne();
    if (!handled) await new Promise((resolve) => setTimeout(resolve, 750));
  }
  database.close();
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
