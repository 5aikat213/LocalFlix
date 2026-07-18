export const PROFILE_ENTRANCE_DURATION_MS = 2_100;

export function profileEntranceDuration(reducedMotion: boolean): number {
  return reducedMotion ? 0 : PROFILE_ENTRANCE_DURATION_MS;
}
