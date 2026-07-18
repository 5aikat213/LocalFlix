import { describe, expect, it } from "vitest";
import { initialPreviewState, previewReducer } from "./preview-model";

describe("detail preview state", () => {
  it("starts only after idle and becomes visible when playable", () => {
    const loading = previewReducer(initialPreviewState, { type: "idle" });
    expect(loading.phase).toBe("loading");
    expect(previewReducer(loading, { type: "ready" }).phase).toBe("playing");
  });

  it("immediately removes playback on interaction and rearms a fresh idle cycle", () => {
    const playing = { phase: "playing" as const, cycle: 4 };
    expect(previewReducer(playing, { type: "activity" })).toEqual({
      phase: "waiting",
      cycle: 5
    });
  });

  it("does not retry a preview that the browser cannot play", () => {
    expect(previewReducer(initialPreviewState, { type: "failed" })).toEqual({
      phase: "unavailable",
      cycle: 0
    });
  });
});
