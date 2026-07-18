import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@localflix/database/test";
import { createProfile, loadBootstrap, loadMediaDetails, setFavorite } from "./catalog";

describe("web catalog service", () => {
  it("bootstraps a Netflix-style profile picker and toggles a favorite", () => {
    const database = createTestDatabase();
    const item = database.catalog.createMediaItem({ kind: "movie", title: "Arrival", releaseYear: 2016 });
    const root = database.catalog.createLibraryRoot({ kind: "movie", path: "/movies" });
    const file = database.catalog.createMediaFile({
      libraryRootId: root.id, mediaItemId: item.id, relativePath: "Arrival.mp4",
      fingerprint: "arrival", sizeBytes: 10, modifiedAtMs: 1
    });

    const bootstrap = loadBootstrap(database);
    expect(bootstrap.profiles).toEqual([
      expect.objectContaining({ name: "Saikat", avatar: "ember" })
    ]);

    expect(setFavorite(database, bootstrap.profiles[0]!.id, item.id, true)).toEqual({
      favorite: true
    });
    expect(database.profiles.isFavorite(bootstrap.profiles[0]!.id, item.id)).toBe(true);
    expect(createProfile(database, { name: "Guest", avatar: "ocean" })).toMatchObject({
      name: "Guest",
      avatar: "ocean"
    });
    expect(database.profiles.list()).toHaveLength(2);
    expect(loadMediaDetails(database, item.id)).toMatchObject({
      id: item.id,
      files: [{
        id: file.id,
        relativePath: "Arrival.mp4",
        previewUrl: `/api/preview/${file.id}`,
        subtitles: []
      }],
      similar: []
    });
    database.close();
  });
});
