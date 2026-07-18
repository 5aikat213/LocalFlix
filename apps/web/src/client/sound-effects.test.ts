import { describe, expect, it } from "vitest";
import { LOGIN_STING_NOTES, previewSoundLabel } from "./sound-effects";

describe("LocalFlix sound effects", () => {
  it("defines a short rising login motif", () => {
    expect(LOGIN_STING_NOTES).toHaveLength(4);
    expect(LOGIN_STING_NOTES.map(({ frequency }) => frequency)).toEqual(
      [...LOGIN_STING_NOTES].map(({ frequency }) => frequency).sort((a, b) => a - b)
    );
    expect(Math.max(...LOGIN_STING_NOTES.map(({ end }) => end))).toBeLessThanOrEqual(1.5);
  });

  it("describes the current automatic-preview sound action", () => {
    expect(previewSoundLabel(false)).toBe("Mute automatic preview");
    expect(previewSoundLabel(true)).toBe("Turn on automatic preview sound");
  });
});
