export type KeyboardPlayerAction = "toggle" | "backward" | "forward" | "fullscreen" | "mute" | null;

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
