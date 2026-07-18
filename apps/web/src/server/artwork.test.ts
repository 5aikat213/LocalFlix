import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "@localflix/database/test";
import { resolveArtwork } from "./artwork";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("artwork delivery", () => {
  it("serves only cached artwork contained by the data directory", async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), "localflix-art-"));
    directories.push(dataDirectory);
    mkdirSync(join(dataDirectory, "artwork"));
    const artPath = join(dataDirectory, "artwork", "poster.jpg");
    writeFileSync(artPath, "jpeg");
    const database = createTestDatabase();
    const item = database.catalog.createMediaItem({ kind: "movie", title: "Arrival" });
    database.catalog.applyMetadata(item.id, {
      canonicalTitle: "Arrival", releaseYear: 2016, overview: "Overview", runtimeMinutes: 116,
      originalLanguage: "en", genres: [], directors: [], cast: [], trailers: [], source: "test", confidence: 1,
      artwork: [{ kind: "poster", localPath: artPath }]
    });

    await expect(resolveArtwork(database, item.id, "poster", dataDirectory)).resolves.toMatchObject({
      absolutePath: realpathSync(artPath),
      contentType: "image/jpeg"
    });
    await expect(resolveArtwork(database, item.id, "logo", dataDirectory)).rejects.toThrow(/not found/i);
    database.close();
  });
});
