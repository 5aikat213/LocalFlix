import type { LocalFlixDatabase } from "@localflix/database";

export interface PlaybackProgressInput {
  profileId: string;
  mediaFileId: string;
  positionMs: number;
  durationMs: number;
  completed?: boolean;
}

export function savePlaybackProgress(
  database: LocalFlixDatabase,
  input: PlaybackProgressInput
) {
  if (
    !Number.isFinite(input.positionMs) ||
    !Number.isFinite(input.durationMs) ||
    input.positionMs < 0 ||
    input.durationMs <= 0
  ) {
    throw new Error("Playback timing values are invalid");
  }
  const positionMs = Math.min(Math.round(input.positionMs), Math.round(input.durationMs));
  const durationMs = Math.round(input.durationMs);
  const completed = input.completed === true || positionMs / durationMs >= 0.95;
  return database.profiles.saveProgress({
    profileId: input.profileId,
    mediaFileId: input.mediaFileId,
    positionMs,
    durationMs,
    completed
  });
}
