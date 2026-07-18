import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig } from "@localflix/config";
import { createTestDatabase } from "@localflix/database/test";
import { SyncService } from "./sync-service";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("library synchronization", () => {
  it("indexes a discovered movie idempotently", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "localflix-sync-"));
    temporaryDirectories.push(rootPath);
    writeFileSync(join(rootPath, "Arrival.2016.mkv"), "fixture");
    writeFileSync(join(rootPath, "Arrival.2016.en.srt"), "1\n00:00:00,000 --> 00:00:01,000\nHello\n");
    const database = createTestDatabase();
    const config = parseConfig(
      {
        dataDirectory: ".localflix",
        movieDirectories: [rootPath],
        seriesDirectories: [],
        scanOnStartup: false
      },
      rootPath
    );
    const sync = new SyncService({
      database,
      config,
      minimumVideoBytes: 0,
      fingerprint: async () => "arrival-fingerprint",
      probe: async () => ({
        container: "matroska",
        durationMs: 116 * 60 * 1_000,
        videoCodec: "h264",
        audioCodec: "aac",
        width: 1920,
        height: 1080,
        hdr: null,
        audioTracks: [
          { streamIndex: 1, language: "en", label: "English", codec: "aac", channels: 6, isDefault: true }
        ],
        subtitleTracks: [
          { streamIndex: 2, language: "en", label: "English", format: "subrip", isDefault: true, forced: false }
        ],
        raw: {}
      })
    });

    await sync.run();
    await sync.run();

    expect(database.catalog.listMediaItems()).toHaveLength(1);
    expect(database.catalog.listMediaFiles()).toEqual([
      expect.objectContaining({
        relativePath: "Arrival.2016.mkv",
        fingerprint: "arrival-fingerprint",
        available: true,
        videoCodec: "h264"
      })
    ]);
    expect(database.jobs.listRecent()).toEqual([
      expect.objectContaining({
        type: "enrich-item",
        dedupeKey: database.catalog.listMediaItems()[0]?.id,
        payload: {
          itemId: database.catalog.listMediaItems()[0]?.id,
          candidate: { kind: "movie", title: "Arrival", year: 2016 }
        }
      })
    ]);
    expect(
      database.sqlite
        .prepare(
          `select stream_index as streamIndex, source_relative_path as sourceRelativePath,
                  language, format from subtitle_tracks order by source_relative_path nulls first`
        )
        .all()
    ).toEqual([
      { streamIndex: 2, sourceRelativePath: null, language: "en", format: "subrip" },
      { streamIndex: null, sourceRelativePath: "Arrival.2016.en.srt", language: "en", format: "srt" }
    ]);
  });

  it("marks an unreadable root offline without deleting its file", async () => {
    const database = createTestDatabase();
    const missingPath = join(tmpdir(), `localflix-missing-${Date.now()}`);
    const root = database.catalog.createLibraryRoot({ kind: "series", path: missingPath });
    const item = database.catalog.createMediaItem({ kind: "series", title: "Dark" });
    database.catalog.createMediaFile({
      libraryRootId: root.id,
      mediaItemId: item.id,
      relativePath: "Dark.S01E01.mkv",
      fingerprint: "dark-episode",
      sizeBytes: 100,
      modifiedAtMs: 1
    });
    const config = parseConfig({ movieDirectories: [], seriesDirectories: [missingPath] });

    await new SyncService({ database, config, minimumVideoBytes: 0 }).run();

    expect(database.catalog.listLibraryRoots()[0]).toMatchObject({ online: false });
    expect(database.catalog.listMediaFiles()[0]).toMatchObject({ available: true });
  });
});
