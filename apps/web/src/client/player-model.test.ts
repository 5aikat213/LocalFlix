import { describe, expect, it } from "vitest";
import { keyboardPlayerAction, progressPercent } from "./player-model";

describe("player model", () => {
  it.each([
    [" ", "toggle"],
    ["ArrowLeft", "backward"],
    ["ArrowRight", "forward"],
    ["f", "fullscreen"],
    ["m", "mute"]
  ] as const)("maps %s to %s", (key, action) => {
    expect(keyboardPlayerAction(key)).toBe(action);
  });

  it("clamps progress to a valid percentage", () => {
    expect(progressPercent(50, 100)).toBe(50);
    expect(progressPercent(150, 100)).toBe(100);
    expect(progressPercent(1, 0)).toBe(0);
  });
});
