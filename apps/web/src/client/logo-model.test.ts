import { describe, expect, it } from "vitest";
import { PROFILE_ENTRANCE_DURATION_MS, profileEntranceDuration } from "./logo-model";

describe("cinematic identity entrance", () => {
  it("holds the visual profile reveal long enough for the logo sting", () => {
    expect(PROFILE_ENTRANCE_DURATION_MS).toBe(2_100);
    expect(profileEntranceDuration(false)).toBe(PROFILE_ENTRANCE_DURATION_MS);
  });

  it("bypasses the entrance when reduced motion is requested", () => {
    expect(profileEntranceDuration(true)).toBe(0);
  });
});
