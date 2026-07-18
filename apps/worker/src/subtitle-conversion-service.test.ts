import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "@localflix/database/test";
import { SubtitleConversionService } from "./subtitle-conversion-service";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("subtitle conversion worker", () => {
  it("extracts an embedded track into the shared WebVTT cache", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "localflix-subtitle-source-"));
    const dataDirectory = mkdtempSync(join(tmpdir(), "localflix-subtitle-cache-"));
    directories.push(rootPath, dataDirectory);
    writeFileSync(join(rootPath, "movie.mkv"), "video");
    const database = createTestDatabase();
    const root = database.catalog.createLibraryRoot({ kind: "movie", path: rootPath });
    const item = database.catalog.createMediaItem({ kind: "movie", title: "Movie" });
    const file = database.catalog.createMediaFile({
      libraryRootId: root.id, mediaItemId: item.id, relativePath: "movie.mkv",
      fingerprint: "movie", sizeBytes: 5, modifiedAtMs: 1
    });
    database.catalog.replaceMediaTracks(file.id, {
      audioTracks: [],
      subtitleTracks: [
        { streamIndex: 3, language: "en", label: "English", format: "subrip", isDefault: true, forced: false }
      ]
    });
    const track = database.sqlite.prepare("select id from subtitle_tracks").get() as { id: string };
    const runConversion = vi.fn(async (_input: string, output: string, streamIndex: number) => {
      expect(streamIndex).toBe(3);
      writeFileSync(output, "WEBVTT\n\n00:01.000 --> 00:02.000\nHello\n");
    });
    const service = new SubtitleConversionService({ database, dataDirectory, runConversion });

    const first = await service.convert({ trackId: track.id });
    const second = await service.convert({ trackId: track.id });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(runConversion).toHaveBeenCalledTimes(1);
    expect(existsSync(first.absolutePath)).toBe(true);
    database.close();
  });
});
