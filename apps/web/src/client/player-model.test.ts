import { describe, expect, it } from "vitest";
import {
  initialSubtitleId,
  keyboardPlayerAction,
  mergeReadySubtitleTracks,
  nextSubtitleSelection,
  progressPercent,
  shouldHandlePlayerShortcut,
  subtitleSizeClass
} from "./player-model";

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

  it("selects the preferred subtitle by stable track id", () => {
    expect(initialSubtitleId([
      { id: "english", isDefault: false },
      { id: "german", isDefault: true }
    ])).toBe("german");
    expect(initialSubtitleId([{ id: "english", isDefault: false }])).toBe("off");
  });

  it.each([
    ["small", "subtitle-size-small"],
    ["medium", "subtitle-size-medium"],
    ["large", "subtitle-size-large"]
  ] as const)("maps %s captions to the %s player class", (size, className) => {
    expect(subtitleSizeClass(size)).toBe(className);
  });

  it("publishes ready subtitle tracks progressively in source order", () => {
    const sourceOrder = ["english", "german", "french"];
    const current = [{ id: "french" }];
    expect(mergeReadySubtitleTracks(current, { id: "english" }, sourceOrder)).toEqual([
      { id: "english" },
      { id: "french" }
    ]);
  });

  it("auto-selects a default track only until the viewer makes a choice", () => {
    expect(nextSubtitleSelection("off", { id: "english", isDefault: true }, false)).toBe("english");
    expect(nextSubtitleSelection("off", { id: "english", isDefault: true }, true)).toBe("off");
  });

  it("leaves player shortcuts disabled while an interactive control has focus", () => {
    expect(shouldHandlePlayerShortcut("BUTTON")).toBe(false);
    expect(shouldHandlePlayerShortcut("INPUT")).toBe(false);
    expect(shouldHandlePlayerShortcut("SELECT")).toBe(false);
    expect(shouldHandlePlayerShortcut("VIDEO")).toBe(true);
  });
});
