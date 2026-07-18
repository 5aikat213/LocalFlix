import { describe, expect, it } from "vitest";
import { CuratedMetadataProvider } from "@localflix/catalog";
import { createTestDatabase } from "@localflix/database/test";
import { MetadataEnrichmentService } from "./enrichment-service";

describe("metadata enrichment service", () => {
  it("uses curated metadata first, caches artwork, and persists the result", async () => {
    const database = createTestDatabase();
    const item = database.catalog.createMediaItem({
      kind: "movie",
      title: "Arrival",
      releaseYear: 2016
    });
    const provider = new CuratedMetadataProvider([
      {
        kind: "movie",
        canonicalTitle: "Arrival",
        releaseYear: 2016,
        aliases: [],
        overview: "A linguist learns to communicate with visitors from another world.",
        runtimeMinutes: 116,
        originalLanguage: "en",
        genres: ["Science Fiction", "Drama"],
        directors: ["Denis Villeneuve"],
        cast: [{ name: "Amy Adams", character: "Louise Banks" }],
        artwork: [
          {
            kind: "poster",
            url: "https://images.example.com/arrival.jpg",
            sourcePageUrl: "https://example.com/arrival"
          }
        ],
        trailers: [],
        sourcePageUrls: ["https://example.com/arrival"]
      }
    ]);
    const service = new MetadataEnrichmentService({
      database,
      dataDirectory: "/tmp/localflix-test",
      providers: [{ name: "curated", provider }],
      cacheArtwork: async ({ url }) => ({
        localPath: "/tmp/localflix-test/artwork/arrival.jpg",
        sourceUrl: url,
        mimeType: "image/jpeg",
        width: 1000,
        height: 1500,
        bytes: 100
      })
    });

    const result = await service.enrich({
      itemId: item.id,
      candidate: { kind: "movie", title: "Arrival", year: 2016 }
    });

    expect(result).toEqual({ provider: "curated", cachedArtwork: 1 });
    expect(database.catalog.getMediaItemDetails(item.id)).toMatchObject({
      metadataSource: "curated",
      overview: expect.stringContaining("linguist"),
      artwork: [{ localPath: "/tmp/localflix-test/artwork/arrival.jpg" }]
    });
    database.close();
  });

  it("falls through providers when an earlier source has no match", async () => {
    const database = createTestDatabase();
    const item = database.catalog.createMediaItem({ kind: "movie", title: "Moon", releaseYear: 2009 });
    const service = new MetadataEnrichmentService({
      database,
      dataDirectory: "/tmp/localflix-test",
      providers: [
        {
          name: "empty",
          provider: { enrich: async () => Promise.reject(new Error("no match")) }
        },
        {
          name: "fallback",
          provider: {
            enrich: async () => ({
              canonicalTitle: "Moon",
              releaseYear: 2009,
              overview: "A solitary lunar worker reaches the end of his contract.",
              runtimeMinutes: 97,
              originalLanguage: "en",
              genres: ["Science Fiction"],
              collections: [],
              directors: ["Duncan Jones"],
              cast: [],
              artwork: [],
              trailers: [],
              sourcePageUrls: [],
              confidence: 0.9
            })
          }
        }
      ]
    });

    await expect(
      service.enrich({
        itemId: item.id,
        candidate: { kind: "movie", title: "Moon", year: 2009 }
      })
    ).resolves.toMatchObject({ provider: "fallback" });
    database.close();
  });
});
