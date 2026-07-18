import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@localflix/database/test";
import { savePlaybackProgress } from "./progress";

describe("playback progress", () => {
  it("persists a profile checkpoint and marks the last five percent complete", () => {
    const database = createTestDatabase();
    const root = database.catalog.createLibraryRoot({ kind: "movie", path: "/movies" });
    const item = database.catalog.createMediaItem({ kind: "movie", title: "Arrival" });
    const file = database.catalog.createMediaFile({
      libraryRootId: root.id,
      mediaItemId: item.id,
      relativePath: "Arrival.mp4",
      fingerprint: "arrival",
      sizeBytes: 10,
      modifiedAtMs: 1
    });
    const profile = database.profiles.ensureDefault();

    expect(
      savePlaybackProgress(database, {
        profileId: profile.id,
        mediaFileId: file.id,
        positionMs: 96_000,
        durationMs: 100_000
      })
    ).toMatchObject({ positionMs: 96_000, completed: true });
    expect(database.profiles.getProgress(profile.id, file.id)).toMatchObject({ completed: true });
    expect(
      database.sqlite.prepare("select kind from watch_events").all()
    ).toEqual([{ kind: "complete" }]);
    database.close();
  });

  it("rejects invalid timing values", () => {
    const database = createTestDatabase();
    expect(() =>
      savePlaybackProgress(database, {
        profileId: "profile",
        mediaFileId: "file",
        positionMs: -1,
        durationMs: 0
      })
    ).toThrow(/timing/i);
    database.close();
  });
});
