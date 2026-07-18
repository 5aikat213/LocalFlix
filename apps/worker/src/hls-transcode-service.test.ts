import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "@localflix/database/test";
import { HlsTranscodeService } from "./hls-transcode-service";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("HLS transcode service", () => {
  it("publishes a fingerprint-keyed cache atomically and reuses it", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "localflix-transcode-source-"));
    const dataDirectory = mkdtempSync(join(tmpdir(), "localflix-transcode-data-"));
    directories.push(rootPath, dataDirectory);
    writeFileSync(join(rootPath, "movie.mkv"), "video");
    const database = createTestDatabase();
    const root = database.catalog.createLibraryRoot({ kind: "movie", path: rootPath });
    const item = database.catalog.createMediaItem({ kind: "movie", title: "Movie" });
    const file = database.catalog.createMediaFile({
      libraryRootId: root.id, mediaItemId: item.id, relativePath: "movie.mkv",
      fingerprint: "stable-fingerprint", sizeBytes: 5, modifiedAtMs: 1
    });
    const runTranscode = vi.fn(async (_inputPath: string, outputDirectory: string) => {
      writeFileSync(join(outputDirectory, "master.m3u8"), "#EXTM3U\nsegment-00000.ts\n");
      writeFileSync(join(outputDirectory, "segment-00000.ts"), "segment");
    });
    const service = new HlsTranscodeService({ database, dataDirectory, runTranscode });

    await expect(service.transcode({ mediaFileId: file.id })).resolves.toEqual({ cached: false });
    await expect(service.transcode({ mediaFileId: file.id })).resolves.toEqual({ cached: true });
    expect(runTranscode).toHaveBeenCalledTimes(1);
    const manifest = join(dataDirectory, "transcodes", "stable-fingerprint", "master.m3u8");
    expect(existsSync(manifest)).toBe(true);
    expect(readFileSync(manifest, "utf8")).toContain("#EXTM3U");
    database.close();
  });
});
