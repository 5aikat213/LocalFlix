import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./test-database";

describe("catalog metadata persistence", () => {
  it("replaces an item's metadata graph atomically and refreshes search", () => {
    const database = createTestDatabase();
    const item = database.catalog.createMediaItem({
      kind: "movie",
      title: "Interstellar",
      releaseYear: 2014
    });
    expect(database.catalog.listEnrichmentCandidates()).toEqual([
      {
        itemId: item.id,
        candidate: { kind: "movie", title: "Interstellar", year: 2014 }
      }
    ]);

    database.catalog.applyMetadata(item.id, {
      canonicalTitle: "Interstellar",
      releaseYear: 2014,
      overview: "Explorers travel through a wormhole to find humanity a new home.",
      runtimeMinutes: 169,
      originalLanguage: "en",
      genres: ["Science Fiction", "Drama"],
      collections: [
        {
          name: "Nolan Science Fiction",
          kind: "curated",
          position: 1,
          overview: "Science-fiction films directed by Christopher Nolan."
        }
      ],
      directors: ["Christopher Nolan"],
      cast: [
        { name: "Matthew McConaughey", character: "Cooper" },
        { name: "Anne Hathaway", character: "Brand" }
      ],
      artwork: [
        {
          kind: "poster",
          localPath: "/tmp/interstellar.jpg",
          sourceUrl: "https://images.example/interstellar.jpg",
          sourcePageUrl: "https://example/interstellar",
          width: 1000,
          height: 1500
        }
      ],
      trailers: [
        {
          title: "Official Trailer",
          youtubeUrl: "https://www.youtube.com/watch?v=zSWdZVtXT7E",
          official: true
        }
      ],
      source: "curated",
      confidence: 1
    });

    const stored = database.catalog.getMediaItemDetails(item.id);
    expect(stored).toMatchObject({
      title: "Interstellar",
      overview: expect.stringContaining("wormhole"),
      runtimeMs: 10_140_000,
      metadataState: "matched",
      metadataSource: "curated",
      genres: ["Drama", "Science Fiction"],
      collections: [
        expect.objectContaining({
          name: "Nolan Science Fiction",
          kind: "curated",
          position: 1
        })
      ],
      directors: ["Christopher Nolan"]
    });
    expect(stored?.cast[0]).toEqual({
      name: "Matthew McConaughey",
      character: "Cooper"
    });
    expect(stored?.artwork[0]?.localPath).toBe("/tmp/interstellar.jpg");
    expect(stored?.trailers[0]?.official).toBe(true);

    const search = database.sqlite
      .prepare("select media_item_id from search_documents where search_documents match ?")
      .all("Nolan") as Array<{ media_item_id: string }>;
    expect(search).toEqual([{ media_item_id: item.id }]);
    expect(database.catalog.listEnrichmentCandidates()).toEqual([]);
    expect(database.catalog.listAllEnrichmentCandidates()).toEqual([
      {
        itemId: item.id,
        candidate: { kind: "movie", title: "Interstellar", year: 2014 }
      }
    ]);
    database.close();
  });
});
