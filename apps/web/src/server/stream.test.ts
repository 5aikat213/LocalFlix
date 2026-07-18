import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "@localflix/database/test";
import { parseByteRange, resolvePlayableFile } from "./stream";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("media streaming", () => {
  it.each([
    ["bytes=0-99", 1_000, { start: 0, end: 99 }],
    ["bytes=100-", 1_000, { start: 100, end: 999 }],
    ["bytes=-100", 1_000, { start: 900, end: 999 }]
  ])("parses %s", (header, size, expected) => {
    expect(parseByteRange(header, size)).toEqual(expected);
  });

  it("rejects unsatisfiable and multipart ranges", () => {
    expect(() => parseByteRange("bytes=1000-1001", 1_000)).toThrow(/satisfiable/i);
    expect(() => parseByteRange("bytes=0-1,3-4", 1_000)).toThrow(/single/i);
  });

  it("resolves an indexed file only when its real path remains inside the library root", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "localflix-stream-"));
    directories.push(rootPath);
    mkdirSync(join(rootPath, "Arrival"));
    writeFileSync(join(rootPath, "Arrival", "movie.mp4"), "movie-bytes");
    const database = createTestDatabase();
    const root = database.catalog.createLibraryRoot({ kind: "movie", path: rootPath });
    const item = database.catalog.createMediaItem({ kind: "movie", title: "Arrival" });
    const file = database.catalog.createMediaFile({
      libraryRootId: root.id,
      mediaItemId: item.id,
      relativePath: "Arrival/movie.mp4",
      fingerprint: "arrival",
      sizeBytes: 11,
      modifiedAtMs: 1
    });

    await expect(resolvePlayableFile(database, file.id)).resolves.toMatchObject({
      absolutePath: realpathSync(join(rootPath, "Arrival", "movie.mp4")),
      mimeType: "video/mp4",
      sizeBytes: 11
    });

    const outside = join(tmpdir(), `outside-${Date.now()}.mp4`);
    writeFileSync(outside, "outside");
    symlinkSync(outside, join(rootPath, "escape.mp4"));
    const escaped = database.catalog.createMediaFile({
      libraryRootId: root.id,
      mediaItemId: item.id,
      relativePath: "escape.mp4",
      fingerprint: "escape",
      sizeBytes: 7,
      modifiedAtMs: 1
    });
    await expect(resolvePlayableFile(database, escaped.id)).rejects.toThrow(/outside/i);
    rmSync(outside, { force: true });
    database.close();
  });
});
