import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "@localflix/database/test";
import { preparePlayback, resolveHlsAsset } from "./playback";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function addFile(database: ReturnType<typeof createTestDatabase>, extension: string, fingerprint: string) {
  const root = database.catalog.findLibraryRoot("movie", "/movies") ?? database.catalog.createLibraryRoot({ kind: "movie", path: "/movies" });
  const item = database.catalog.createMediaItem({ kind: "movie", title: fingerprint });
  return database.catalog.createMediaFile({
    libraryRootId: root.id,
    mediaItemId: item.id,
    relativePath: `${fingerprint}.${extension}`,
    fingerprint,
    sizeBytes: 100,
    modifiedAtMs: 1
  });
}

describe("playback preparation", () => {
  it("returns direct playback for compatible media", () => {
    const database = createTestDatabase();
    const file = addFile(database, "mp4", "direct");
    database.catalog.updateMediaFileProbe(file.id, {
      container: "mov,mp4,m4a", durationMs: 1000, videoCodec: "h264", audioCodec: "aac",
      width: 1920, height: 1080, hdr: null, raw: {}
    });
    expect(preparePlayback(database, file.id, "/tmp/data")).toMatchObject({
      mode: "direct",
      status: "ready",
      url: `/api/stream/${file.id}`
    });
    database.close();
  });

  it("deduplicates an HLS job and reports a cached playlist when ready", () => {
    const database = createTestDatabase();
    const dataDirectory = mkdtempSync(join(tmpdir(), "localflix-hls-"));
    directories.push(dataDirectory);
    const file = addFile(database, "mkv", "hls-fingerprint");
    database.catalog.updateMediaFileProbe(file.id, {
      container: "matroska", durationMs: 1000, videoCodec: "hevc", audioCodec: "aac",
      width: 3840, height: 2160, hdr: "hdr10", raw: {}
    });

    expect(preparePlayback(database, file.id, dataDirectory)).toMatchObject({ mode: "hls", status: "pending" });
    expect(preparePlayback(database, file.id, dataDirectory)).toMatchObject({ mode: "hls", status: "pending" });
    expect(database.jobs.listRecent()).toHaveLength(1);

    const directory = join(dataDirectory, "transcodes", "hls-fingerprint");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "master.m3u8"), "#EXTM3U");
    expect(preparePlayback(database, file.id, dataDirectory)).toMatchObject({
      mode: "hls", status: "ready", url: `/api/hls/${file.id}/master.m3u8`
    });
    expect(resolveHlsAsset(database, file.id, "master.m3u8", dataDirectory)).toMatchObject({
      absolutePath: join(directory, "master.m3u8"),
      contentType: "application/vnd.apple.mpegurl"
    });
    expect(() => resolveHlsAsset(database, file.id, "../secret", dataDirectory)).toThrow(/asset/i);
    database.close();
  });
});
