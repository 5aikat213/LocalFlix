export type PreviewPhase = "waiting" | "loading" | "playing" | "unavailable";

export interface PreviewState {
  phase: PreviewPhase;
  cycle: number;
}

export type PreviewEvent =
  | { type: "idle" }
  | { type: "ready" }
  | { type: "activity" }
  | { type: "ended" }
  | { type: "failed" };

export const initialPreviewState: PreviewState = {
  phase: "waiting",
  cycle: 0
};

export function previewReducer(state: PreviewState, event: PreviewEvent): PreviewState {
  switch (event.type) {
    case "idle":
      return state.phase === "waiting" ? { ...state, phase: "loading" } : state;
    case "ready":
      return state.phase === "loading" ? { ...state, phase: "playing" } : state;
    case "activity":
    case "ended":
      return { phase: "waiting", cycle: state.cycle + 1 };
    case "failed":
      return { ...state, phase: "unavailable" };
  }
}
