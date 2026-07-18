import { describe, expect, it } from "vitest";
import { formatRuntime, subtitleLabel } from "./ui-model";

describe("cinematic UI formatting", () => {
  it("formats long runtimes compactly", () => {
    expect(formatRuntime(169 * 60_000)).toBe("2h 49m");
    expect(formatRuntime(null)).toBeNull();
  });

  it("builds a readable subtitle label", () => {
    expect(subtitleLabel({ language: "en", label: "English", forced: true })).toBe("English · Forced");
    expect(subtitleLabel({ language: null, label: "Subtitle 3", forced: false })).toBe("Subtitle 3");
  });
});
