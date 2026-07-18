import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "@localflix/database/test";
import { prepareSubtitleAsset } from "./subtitles";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("subtitle assets", () => {
  it("converts and caches an indexed external SRT as WebVTT", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "localflix-subtitle-root-"));
    const dataDirectory = mkdtempSync(join(tmpdir(), "localflix-subtitle-data-"));
    directories.push(rootPath, dataDirectory);
    writeFileSync(join(rootPath, "movie.mp4"), "video");
    writeFileSync(join(rootPath, "movie.en.srt"), "1\n00:00:01,000 --> 00:00:02,000\nHello\n");
    const database = createTestDatabase();
    const root = database.catalog.createLibraryRoot({ kind: "movie", path: rootPath });
    const item = database.catalog.createMediaItem({ kind: "movie", title: "Movie" });
    const file = database.catalog.createMediaFile({
      libraryRootId: root.id, mediaItemId: item.id, relativePath: "movie.mp4",
      fingerprint: "movie", sizeBytes: 5, modifiedAtMs: 1
    });
    database.catalog.replaceExternalSubtitleTracks(file.id, [
      { relativePath: "movie.en.srt", language: "en", label: "English", format: "srt" }
    ]);
    const track = database.sqlite.prepare("select id from subtitle_tracks").get() as { id: string };

    const result = await prepareSubtitleAsset(database, track.id, dataDirectory);
    expect(result).toMatchObject({ status: "ready", contentType: "text/vtt; charset=utf-8" });
    expect(existsSync(result.absolutePath!)).toBe(true);
    expect(readFileSync(result.absolutePath!, "utf8")).toContain("00:00:01.000");
    database.close();
  });
});
