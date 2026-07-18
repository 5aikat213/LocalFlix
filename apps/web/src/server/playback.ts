import { existsSync } from "node:fs";
import { join } from "node:path";
import { decidePlayback } from "@localflix/catalog/playback";
import type { LocalFlixDatabase } from "@localflix/database";

export interface PlaybackInfo {
  mode: "direct" | "hls";
  status: "ready" | "pending";
  url: string | null;
  reason: string;
}

export function hlsCacheDirectory(dataDirectory: string, fingerprint: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(fingerprint)) throw new Error("Media fingerprint is invalid");
  return join(dataDirectory, "transcodes", fingerprint);
}

export function preparePlayback(
  database: LocalFlixDatabase,
  mediaFileId: string,
  dataDirectory: string
): PlaybackInfo {
  const file = database.sqlite
    .prepare(
      `select fingerprint, container, video_codec as videoCodec, audio_codec as audioCodec
       from media_files where id = ? and available = 1`
    )
    .get(mediaFileId) as
    | { fingerprint: string; container: string | null; videoCodec: string | null; audioCodec: string | null }
    | undefined;
  if (!file) throw new Error("Playable media file was not found");
  const decision = decidePlayback(file);
  if (decision.mode === "direct") {
    return {
      mode: "direct",
      status: "ready",
      url: `/api/stream/${encodeURIComponent(mediaFileId)}`,
      reason: decision.reason
    };
  }
  const directory = hlsCacheDirectory(dataDirectory, file.fingerprint);
  if (existsSync(join(directory, "master.m3u8"))) {
    return {
      mode: "hls",
      status: "ready",
      url: `/api/hls/${encodeURIComponent(mediaFileId)}/master.m3u8`,
      reason: decision.reason
    };
  }
  database.jobs.enqueueUnique("transcode-hls", file.fingerprint, { mediaFileId });
  return { mode: "hls", status: "pending", url: null, reason: decision.reason };
}

export function resolveHlsAsset(
  database: LocalFlixDatabase,
  mediaFileId: string,
  asset: string,
  dataDirectory: string
): { absolutePath: string; contentType: string } {
  if (!/^(?:master\.m3u8|segment-\d{5}\.ts)$/.test(asset)) {
    throw new Error("HLS asset name is invalid");
  }
  const row = database.sqlite
    .prepare("select fingerprint from media_files where id = ? and available = 1")
    .get(mediaFileId) as { fingerprint: string } | undefined;
  if (!row) throw new Error("HLS media file was not found");
  const absolutePath = join(hlsCacheDirectory(dataDirectory, row.fingerprint), asset);
  if (!existsSync(absolutePath)) throw new Error("HLS asset was not found");
  return {
    absolutePath,
    contentType: asset.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t"
  };
}
