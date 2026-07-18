import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cacheArtwork } from "./artwork-cache";
import { CuratedMetadataProvider } from "./curated-provider";
import { OpenAiMetadataProvider, MetadataProviderError } from "./openai-provider";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("metadata providers", () => {
  it("returns an exact curated title and year match", async () => {
    const provider = new CuratedMetadataProvider([
      {
        kind: "movie",
        canonicalTitle: "Interstellar",
        releaseYear: 2014,
        aliases: ["Interstellar 2014"],
        overview: "Explorers travel through a wormhole in space.",
        runtimeMinutes: 169,
        originalLanguage: "en",
        genres: ["Science Fiction", "Drama"],
        directors: ["Christopher Nolan"],
        cast: [{ name: "Matthew McConaughey", character: "Cooper" }],
        artwork: [],
        trailers: [],
        sourcePageUrls: ["https://en.wikipedia.org/wiki/Interstellar_(film)"]
      }
    ]);

    await expect(
      provider.enrich({ kind: "movie", title: "Interstellar", year: 2014 })
    ).resolves.toMatchObject({
      canonicalTitle: "Interstellar",
      releaseYear: 2014,
      confidence: 1,
      collections: []
    });
  });

  it("maps OpenAI quota errors to retryable provider errors", async () => {
    const provider = new OpenAiMetadataProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: { code: "insufficient_quota", message: "Quota exceeded" }
          }),
          { status: 429, headers: { "content-type": "application/json" } }
        )
    });

    const error = await provider
      .enrich({ kind: "movie", title: "Interstellar", year: 2014 })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MetadataProviderError);
    expect(error).toMatchObject({ code: "insufficient_quota", retryable: true });
  });

  it("keeps artwork only when the URL was returned by web image search", async () => {
    const posterUrl = "https://images.example.com/interstellar-poster.jpg";
    const provider = new OpenAiMetadataProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        Response.json({
          id: "resp_test",
          status: "completed",
          output: [
            {
              type: "web_search_call",
              status: "completed",
              results: [{ type: "image_result", image_url: posterUrl }]
            },
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    canonicalTitle: "Interstellar",
                    releaseYear: 2014,
                    overview: "Explorers travel through a wormhole in space.",
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
                    cast: [{ name: "Matthew McConaughey", character: "Cooper" }],
                    artwork: [
                      {
                        kind: "poster",
                        url: posterUrl,
                        sourcePageUrl: "https://example.com/interstellar"
                      },
                      {
                        kind: "backdrop",
                        url: "https://invented.example.com/backdrop.jpg",
                        sourcePageUrl: null
                      }
                    ],
                    trailers: [],
                    sourcePageUrls: ["https://example.com/interstellar"],
                    confidence: 0.98
                  })
                }
              ]
            }
          ]
        })
    });

    const result = await provider.enrich({
      kind: "movie",
      title: "Interstellar",
      year: 2014
    });

    expect(result.artwork).toEqual([expect.objectContaining({ url: posterUrl })]);
    expect(result.collections).toEqual([
      expect.objectContaining({ name: "Nolan Science Fiction", position: 1 })
    ]);
  });
});

describe("artwork cache", () => {
  it.each(["http://127.0.0.1/poster.jpg", "file:///etc/passwd"])(
    "rejects unsafe source %s",
    async (url) => {
      const directory = mkdtempSync(join(tmpdir(), "localflix-artwork-"));
      temporaryDirectories.push(directory);
      await expect(cacheArtwork({ url, dataDirectory: directory })).rejects.toThrow(/safe|https/i);
    }
  );

  it("validates and atomically caches a public image", async () => {
    const directory = mkdtempSync(join(tmpdir(), "localflix-artwork-"));
    temporaryDirectories.push(directory);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlXcToAAAAASUVORK5CYII=",
      "base64"
    );

    const result = await cacheArtwork({
      url: "https://images.example.com/poster.png",
      dataDirectory: directory,
      fetchImpl: async () =>
        new Response(png, {
          status: 200,
          headers: { "content-length": String(png.length), "content-type": "image/png" }
        }),
      resolveHost: async () => [{ address: "93.184.216.34", family: 4 }]
    });

    expect(result).toMatchObject({ width: 1, height: 1, mimeType: "image/png" });
    expect(existsSync(result.localPath)).toBe(true);
    expect(readFileSync(result.localPath)).toEqual(png);
  });
});
