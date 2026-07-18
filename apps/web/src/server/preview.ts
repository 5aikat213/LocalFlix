import { spawn } from "node:child_process";
import type { LocalFlixDatabase } from "@localflix/database";
import { resolvePlayableFile } from "./stream";

const PREVIEW_DURATION_SECONDS = 30;

export interface PreviewSource {
  absolutePath: string;
  startSeconds: number;
}

export function choosePreviewStartSeconds(
  durationMs: number | null,
  random: () => number = Math.random
): number {
  const durationSeconds = Math.max(0, (durationMs ?? 0) / 1_000);
  if (durationSeconds <= PREVIEW_DURATION_SECONDS) return 0;
  const margin = Math.min(60, durationSeconds * 0.075);
  const maximum = Math.max(0, durationSeconds - PREVIEW_DURATION_SECONDS - margin);
  const minimum = Math.min(margin, maximum);
  const sample = Math.max(0, Math.min(1, random()));
  return Math.floor(minimum + (maximum - minimum) * sample);
}

export function previewArguments(source: PreviewSource): string[] {
  return [
    "-hide_banner",
    "-loglevel", "error",
    "-nostdin",
    "-ss", String(source.startSeconds),
    "-i", source.absolutePath,
    "-t", String(PREVIEW_DURATION_SECONDS),
    "-map", "0:v:0",
    "-an",
    "-sn",
    "-dn",
    "-vf", "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "24",
    "-pix_fmt", "yuv420p",
    "-g", "48",
    "-keyint_min", "48",
    "-sc_threshold", "0",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-avoid_negative_ts", "make_zero",
    "-f", "mp4",
    "pipe:1"
  ];
}

export async function resolvePreviewSource(
  database: LocalFlixDatabase,
  mediaFileId: string,
  random: () => number = Math.random
): Promise<PreviewSource> {
  const row = database.sqlite
    .prepare("select duration_ms as durationMs from media_files where id = ? and available = 1")
    .get(mediaFileId) as { durationMs: number | null } | undefined;
  if (!row) throw new Error("Preview media file was not found");
  const playable = await resolvePlayableFile(database, mediaFileId);
  return {
    absolutePath: playable.absolutePath,
    startSeconds: choosePreviewStartSeconds(row.durationMs, random)
  };
}

export function spawnPreview(source: PreviewSource) {
  return spawn("ffmpeg", previewArguments(source), {
    stdio: ["ignore", "pipe", "pipe"]
  });
}
