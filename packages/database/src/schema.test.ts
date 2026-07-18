import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./test-database";

describe("LocalFlix database", () => {
  it("creates the normalized catalog and FTS schema", () => {
    const database = createTestDatabase();
    const tableNames = database.sqlite
      .prepare(
        "select name from sqlite_master where type in ('table', 'view') order by name"
      )
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        "library_roots",
        "media_items",
        "media_files",
        "collections",
        "media_collections",
        "profiles",
        "watch_progress",
        "jobs",
        "search_documents"
      ])
    );
  });

  it("isolates progress for two profiles on the same file", () => {
    const database = createTestDatabase();
    const root = database.catalog.createLibraryRoot({
      kind: "movie",
      path: "/media/movies"
    });
    const item = database.catalog.createMediaItem({ kind: "movie", title: "Arrival" });
    const file = database.catalog.createMediaFile({
      libraryRootId: root.id,
      mediaItemId: item.id,
      relativePath: "Arrival.mkv",
      fingerprint: "arrival-file",
      sizeBytes: 1_000,
      modifiedAtMs: 10
    });
    const saikat = database.profiles.create({ name: "Saikat", avatar: "orbit" });
    const guest = database.profiles.create({ name: "Guest", avatar: "sunset" });

    database.profiles.saveProgress({
      profileId: saikat.id,
      mediaFileId: file.id,
      positionMs: 60_000,
      durationMs: 100_000,
      completed: false
    });

    expect(database.profiles.getProgress(guest.id, file.id)).toBeNull();
    expect(database.profiles.getProgress(saikat.id, file.id)).toMatchObject({
      positionMs: 60_000,
      completed: false
    });
  });

  it("prevents two active records for the same root fingerprint", () => {
    const database = createTestDatabase();
    const root = database.catalog.createLibraryRoot({
      kind: "movie",
      path: "/media/movies"
    });
    const item = database.catalog.createMediaItem({ kind: "movie", title: "Arrival" });
    const input = {
      libraryRootId: root.id,
      mediaItemId: item.id,
      relativePath: "Arrival.mkv",
      fingerprint: "same-file",
      sizeBytes: 1_000,
      modifiedAtMs: 10
    };

    database.catalog.createMediaFile(input);
    expect(() =>
      database.catalog.createMediaFile({ ...input, relativePath: "Moved/Arrival.mkv" })
    ).toThrow(/UNIQUE/);
  });
});
