export function formatRuntime(runtimeMs: number | null): string | null {
  if (runtimeMs === null || runtimeMs <= 0) return null;
  const minutes = Math.round(runtimeMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${minutes}m`;
}

export function subtitleLabel(track: {
  language: string | null;
  label: string;
  forced: boolean;
}): string {
  return track.forced ? `${track.label} · Forced` : track.label;
}
