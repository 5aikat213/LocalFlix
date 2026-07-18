import {
  cacheArtwork as cacheArtworkToDisk,
  type CacheArtworkInput,
  type CachedArtwork,
  type MetadataCandidate,
  type MetadataProvider
} from "@localflix/catalog";
import type { LocalFlixDatabase } from "@localflix/database";

export interface EnrichmentPayload {
  itemId: string;
  candidate: MetadataCandidate;
}

interface MetadataEnrichmentServiceOptions {
  database: LocalFlixDatabase;
  dataDirectory: string;
  providers: Array<{ name: string; provider: MetadataProvider }>;
  cacheArtwork?: (input: CacheArtworkInput) => Promise<CachedArtwork>;
}

export class MetadataEnrichmentService {
  private readonly database: LocalFlixDatabase;
  private readonly dataDirectory: string;
  private readonly providers: MetadataEnrichmentServiceOptions["providers"];
  private readonly cacheArtwork: NonNullable<MetadataEnrichmentServiceOptions["cacheArtwork"]>;

  constructor(options: MetadataEnrichmentServiceOptions) {
    this.database = options.database;
    this.dataDirectory = options.dataDirectory;
    this.providers = options.providers;
    this.cacheArtwork = options.cacheArtwork ?? cacheArtworkToDisk;
  }

  async enrich(payload: EnrichmentPayload): Promise<{ provider: string; cachedArtwork: number }> {
    const failures: Error[] = [];
    for (const source of this.providers) {
      try {
        const metadata = await source.provider.enrich(payload.candidate);
        const cachedResults = await Promise.allSettled(
          metadata.artwork.map(async (candidate) => ({
            candidate,
            cached: await this.cacheArtwork({
              url: candidate.url,
              dataDirectory: this.dataDirectory
            })
          }))
        );
        const artwork = cachedResults.flatMap((result) =>
          result.status === "fulfilled"
            ? [
                {
                  kind: result.value.candidate.kind,
                  localPath: result.value.cached.localPath,
                  sourceUrl: result.value.candidate.url,
                  sourcePageUrl: result.value.candidate.sourcePageUrl ?? null,
                  width: result.value.cached.width,
                  height: result.value.cached.height
                }
              ]
            : []
        );
        this.database.catalog.applyMetadata(payload.itemId, {
          ...metadata,
          artwork,
          source: source.name
        });
        return { provider: source.name, cachedArtwork: artwork.length };
      } catch (error) {
        failures.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    throw new AggregateError(
      failures,
      `No metadata provider matched ${payload.candidate.title} (${payload.candidate.year ?? "unknown year"})`
    );
  }
}
