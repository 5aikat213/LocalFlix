export type KeyboardPlayerAction = "toggle" | "backward" | "forward" | "fullscreen" | "mute" | null;
export type SubtitleSize = "small" | "medium" | "large";

export const SUBTITLE_SIZE_OPTIONS: ReadonlyArray<{ value: SubtitleSize; label: string }> = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" }
];

export function initialSubtitleId(tracks: ReadonlyArray<{ id: string; isDefault: boolean }>): string {
  return tracks.find(({ isDefault }) => isDefault)?.id ?? "off";
}

export function subtitleSizeClass(size: SubtitleSize): string {
  return `subtitle-size-${size}`;
}

export function mergeReadySubtitleTracks<T extends { id: string }>(
  current: readonly T[],
  ready: T,
  sourceOrder: readonly string[]
): T[] {
  if (current.some(({ id }) => id === ready.id)) return [...current];
  const position = new Map(sourceOrder.map((id, index) => [id, index]));
  return [...current, ready].sort(
    (left, right) => (position.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (position.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  );
}

export function nextSubtitleSelection(
  currentId: string,
  ready: { id: string; isDefault: boolean },
  viewerHasChosen: boolean
): string {
  return !viewerHasChosen && ready.isDefault ? ready.id : currentId;
}

export function shouldHandlePlayerShortcut(tagName: string): boolean {
  return !["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(tagName.toUpperCase());
}

export function keyboardPlayerAction(key: string): KeyboardPlayerAction {
  switch (key.toLowerCase()) {
    case " ": return "toggle";
    case "arrowleft": return "backward";
    case "arrowright": return "forward";
    case "f": return "fullscreen";
    case "m": return "mute";
    default: return null;
  }
}

export function progressPercent(currentSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return Math.max(0, Math.min(100, (currentSeconds / durationSeconds) * 100));
}

export function formatPlayerTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
